import prisma from '../../../lib/prisma.js'
import { env } from '../../config/env.js'
import { sendMail } from '../../lib/mail.js'
import { httpError } from '../../shared/errors.js'
import { formatAddressLine } from '../../shared/address.js'
import { money } from '../../shared/money.js'
import { companyDisplayName, partyName } from '../../shared/party.js'
import { payoutStatusLabel } from '../../shared/payout-status.js'
import { SELF_DELIVERY_HOURS } from '../admin/settings/catalog.js'
import {
  deliveryDecisionMinutes,
  loadPlatformSettings,
} from '../admin/settings/settings.store.js'
import auctionService from '../auctions/services/auction.service.js'
import { commissionPercentOf } from '../payments/eupago.client.js'

const CLOSED_STATUSES = ['CANCELLED', 'DELIVERED', 'COMPLETED']

function assertSupplier(auth) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'supplier') {
    throw httpError('Only suppliers can manage deliveries', 403, 'Forbidden')
  }
  return auth.id
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** What the supplier earns for delivering himself: the shipping fee net of commission, like a carrier. */
function selfDeliveryPayout(order) {
  const percent = commissionPercentOf(order.seller)
  return money(Number(order.shippingFee || 0) * (1 - percent / 100))
}

const deliveryOrderInclude = {
  seller: { select: { vatRate: true } },
  customer: {
    select: {
      name: true,
      email: true,
      phoneNumber: true,
      profile: { select: { companyName: true } },
    },
  },
  checkoutSession: { select: { firstName: true, lastName: true, phone: true } },
  shippingAddress: true,
  orderLineItems: {
    take: 1,
    select: { quantity: true, product: { select: { title: true, unitOfMeasure: true } } },
  },
  shipment: {
    select: {
      auction: {
        select: {
          id: true,
          auctionCode: true,
          auctionStatus: true,
          expiresAt: true,
          bids: {
            where: { status: 'ACCEPTED' },
            take: 1,
            select: {
              bidAmount: true,
              transporter: {
                select: { name: true, profile: { select: { companyName: true } } },
              },
            },
          },
        },
      },
    },
  },
}

function customerName(order) {
  const session = order.checkoutSession
  return (
    companyDisplayName(order.customer) ||
    [session?.firstName, session?.lastName].filter(Boolean).join(' ') ||
    partyName(order.customer) ||
    'Customer'
  )
}

function mapDeliveryOrder(order, now = new Date()) {
  const line = order.orderLineItems?.[0]
  const auction = order.shipment?.auction || null
  const winner = auction?.bids?.[0] || null
  const delivered = Boolean(order.deliveredAt) || order.orderStatus === 'DELIVERED'
  const isLate =
    order.deliveryMode === 'SELF' &&
    order.selfDeliveryDeadline != null &&
    (order.deliveredAt
      ? order.deliveredAt > order.selfDeliveryDeadline
      : !delivered && order.selfDeliveryDeadline < now)

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    deliveryMode: order.deliveryMode,
    decisionDeadline: order.deliveryDecisionDeadline,
    selfDeliveryDeadline: order.selfDeliveryDeadline,
    deliveredAt: order.deliveredAt,
    isLate,
    shippingFee: money(order.shippingFee),
    selfDeliveryPayout: selfDeliveryPayout(order),
    customer: {
      name: customerName(order),
      phone: order.checkoutSession?.phone || order.customer?.phoneNumber || null,
    },
    deliveryAddress: formatAddressLine(order.shippingAddress) || null,
    product: line
      ? {
          title: line.product?.title || null,
          quantity: line.quantity,
          unit: line.product?.unitOfMeasure || null,
        }
      : null,
    auction: auction
      ? {
          id: auction.id,
          code: auction.auctionCode,
          status: auction.auctionStatus,
          expiresAt: auction.expiresAt,
          transporter: winner ? partyName(winner.transporter) : null,
          bidAmount: winner ? money(winner.bidAmount) : null,
        }
      : null,
    createdAt: order.createdAt,
  }
}

function decisionMail({ to, orderNumber, minutes }) {
  const url = `${env.frontendUrl}/supplier/delivery-logistics`
  const subject = `New order ${orderNumber}: choose the delivery within ${minutes} minutes`
  const text = [
    `You have a new paid order: ${orderNumber}.`,
    `You have ${minutes} minutes to choose whether you deliver it yourself or send it to carriers.`,
    'If you do not choose in time, the order goes to the carriers automatically.',
    `Open: ${url}`,
  ].join('\n')
  const html = `
    <div style="font-family:sans-serif;max-width:520px">
      <h2>CONSTRUPRECO</h2>
      <p>You have a new paid order: <strong>${escapeHtml(orderNumber)}</strong>.</p>
      <p>You have <strong>${minutes} minutes</strong> to choose whether you deliver it yourself or send it to carriers.</p>
      <p>If you do not choose in time, the order goes to the carriers automatically.</p>
      <p><a href="${escapeHtml(url)}">Choose the delivery</a></p>
    </div>
  `
  return { to, subject, text, html }
}

class SupplierDeliveryService {
  /**
   * Starts the supplier's delivery decision window for freshly paid orders and emails the supplier.
   * Never throws: payment confirmation must not fail because of this.
   */
  async scheduleDecisions(orderIds = []) {
    try {
      const ids = [...new Set(orderIds)].filter(Boolean)
      if (!ids.length) return

      const minutes = deliveryDecisionMinutes(await loadPlatformSettings())
      const deadline = new Date(Date.now() + minutes * 60 * 1000)
      const orders = await prisma.order.findMany({
        where: {
          id: { in: ids },
          deliveryMode: null,
          deliveryDecisionDeadline: null,
          shippingFee: { gt: 0 },
          orderStatus: { notIn: CLOSED_STATUSES },
          seller: { role: 'SUPPLIER' },
        },
        select: { id: true, orderNumber: true, seller: { select: { email: true } } },
      })

      for (const order of orders) {
        await prisma.order.update({
          where: { id: order.id },
          data: { deliveryDecisionDeadline: deadline },
        })
        if (order.seller?.email) {
          sendMail(decisionMail({ to: order.seller.email, orderNumber: order.orderNumber, minutes })).catch(
            (err) => console.error('[supplier-delivery] mail failed', err.message),
          )
        }
      }
    } catch (err) {
      console.error('[supplier-delivery] schedule failed', err.message)
    }
  }

  async list(auth) {
    const sellerId = assertSupplier(auth)
    const now = new Date()

    const [pending, self, carrier] = await Promise.all([
      prisma.order.findMany({
        where: {
          sellerId,
          deliveryMode: null,
          deliveryDecisionDeadline: { not: null },
          orderStatus: { notIn: CLOSED_STATUSES },
        },
        include: deliveryOrderInclude,
        orderBy: { deliveryDecisionDeadline: 'asc' },
      }),
      prisma.order.findMany({
        where: { sellerId, deliveryMode: 'SELF', orderStatus: { not: 'CANCELLED' } },
        include: deliveryOrderInclude,
        orderBy: [{ deliveredAt: { sort: 'desc', nulls: 'first' } }, { selfDeliveryDeadline: 'asc' }],
        take: 50,
      }),
      prisma.order.findMany({
        where: {
          sellerId,
          deliveryMode: 'CARRIER',
          orderStatus: { notIn: CLOSED_STATUSES },
          shipment: { auction: { auctionStatus: { in: ['PENDING_BIDS', 'EXPIRED'] } } },
        },
        include: deliveryOrderInclude,
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ])

    return {
      status: 200,
      body: {
        pending: pending.map((o) => mapDeliveryOrder(o, now)),
        self: self.map((o) => mapDeliveryOrder(o, now)),
        awaitingCarrier: carrier.map((o) => mapDeliveryOrder(o, now)),
        serverTime: now,
        message: 'Deliveries fetched',
      },
    }
  }

  async loadOwnOrder(sellerId, orderId) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, sellerId },
      include: deliveryOrderInclude,
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')
    if (order.orderStatus === 'CANCELLED') {
      throw httpError('This order was cancelled', 400, 'OrderCancelled')
    }
    return order
  }

  /** A carrier auction that ended without bids lets the supplier decide again. */
  canDecide(order) {
    if (order.deliveryMode == null) return true
    return order.deliveryMode === 'CARRIER' && order.shipment?.auction?.auctionStatus === 'EXPIRED'
  }

  async chooseSelf(auth, orderId) {
    const sellerId = assertSupplier(auth)
    const order = await this.loadOwnOrder(sellerId, orderId)
    if (!this.canDecide(order)) {
      throw httpError('The delivery was already decided for this order', 409, 'AlreadyDecided')
    }
    if (order.deliveryMode == null && order.deliveryDecisionDeadline && order.deliveryDecisionDeadline < new Date()) {
      throw httpError('The decision time is over; the order was sent to carriers', 409, 'DecisionExpired')
    }

    const selfDeliveryDeadline = new Date(Date.now() + SELF_DELIVERY_HOURS * 60 * 60 * 1000)
    const accept = order.orderStatus === 'NEW'
    await prisma.$transaction(async (tx) => {
      if (order.shipment?.auction?.id) {
        await tx.shipmentAuction.update({
          where: { id: order.shipment.auction.id },
          data: { auctionStatus: 'CANCELLED' },
        })
      }
      await tx.order.update({
        where: { id: order.id },
        data: {
          deliveryMode: 'SELF',
          selfDeliveryDeadline,
          ...(accept ? { orderStatus: 'PENDING' } : {}),
          statusHistory: {
            create: {
              status: accept ? 'PENDING' : order.orderStatus,
              note: 'Supplier will deliver the order himself',
            },
          },
        },
      })
    })

    return {
      status: 200,
      body: { orderId: order.id, deliveryMode: 'SELF', selfDeliveryDeadline, message: 'You will deliver this order' },
    }
  }

  async chooseCarrier(auth, orderId) {
    const sellerId = assertSupplier(auth)
    const order = await this.loadOwnOrder(sellerId, orderId)
    if (!this.canDecide(order)) {
      throw httpError('The delivery was already decided for this order', 409, 'AlreadyDecided')
    }
    const { auction } = await auctionService.openSupplierAuctionForOrder(order.id)
    return {
      status: 200,
      body: {
        orderId: order.id,
        deliveryMode: 'CARRIER',
        auctionId: auction.auctionCode,
        message: 'The order was sent to carriers',
      },
    }
  }

  async markDelivered(auth, orderId) {
    const sellerId = assertSupplier(auth)
    const order = await this.loadOwnOrder(sellerId, orderId)
    if (order.deliveryMode !== 'SELF') {
      throw httpError('Only orders you deliver yourself can be marked as delivered', 400, 'NotSelfDelivery')
    }
    if (order.deliveredAt || CLOSED_STATUSES.includes(order.orderStatus)) {
      throw httpError('This order is already delivered', 409, 'AlreadyDelivered')
    }

    const deliveredAt = new Date()
    const late = order.selfDeliveryDeadline != null && deliveredAt > order.selfDeliveryDeadline
    const gross = money(order.shippingFee)
    const payout = selfDeliveryPayout(order)
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          orderStatus: 'DELIVERED',
          deliveredAt,
          statusHistory: {
            create: {
              status: 'DELIVERED',
              note: late ? 'Delivered by the supplier after the deadline' : 'Delivered by the supplier',
            },
          },
        },
      })
      if (payout > 0) {
        const wallet = await tx.wallet.upsert({
          where: { userId: sellerId },
          create: { userId: sellerId, availableBalance: payout },
          update: { availableBalance: { increment: payout } },
          select: { id: true },
        })
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            grossAmount: gross,
            platformFee: money(gross - payout),
            netAmount: payout,
            description: `Self delivery ${order.orderNumber}`,
          },
        })
      }
    })

    return {
      status: 200,
      body: { orderId: order.id, deliveredAt, isLate: late, payout, message: 'Order marked as delivered' },
    }
  }

  /** Balance earned from self deliveries, still-to-earn amount, and withdrawal history. */
  async earnings(auth) {
    const sellerId = assertSupplier(auth)
    const [wallet, openSelf, withdrawals, profile] = await Promise.all([
      prisma.wallet.findUnique({
        where: { userId: sellerId },
        select: { availableBalance: true, transactions: { select: { netAmount: true } } },
      }),
      prisma.order.findMany({
        where: { sellerId, deliveryMode: 'SELF', deliveredAt: null, orderStatus: { notIn: CLOSED_STATUSES } },
        select: { shippingFee: true, seller: { select: { vatRate: true } } },
      }),
      prisma.withdrawalRequest.findMany({
        where: { userId: sellerId },
        orderBy: { requestedAt: 'desc' },
        take: 20,
      }),
      prisma.businessProfile.findUnique({ where: { userId: sellerId }, select: { ibanNumber: true } }),
    ])

    return {
      status: 200,
      body: {
        availableBalance: money(wallet?.availableBalance || 0),
        totalEarned: money((wallet?.transactions || []).reduce((sum, t) => sum + Number(t.netAmount || 0), 0)),
        pendingEarnings: money(openSelf.reduce((sum, o) => sum + selfDeliveryPayout(o), 0)),
        defaultAccountNumber: profile?.ibanNumber || '',
        withdrawals: withdrawals.map((w) => ({
          id: w.id,
          amount: money(w.amount),
          accountNumber: w.accountNumber,
          status: payoutStatusLabel(w.status),
          requestedAt: w.requestedAt,
          processedAt: w.processedAt,
        })),
        message: 'Delivery earnings fetched',
      },
    }
  }

  async withdraw(auth, body = {}) {
    const sellerId = assertSupplier(auth)
    const amount = money(body.amount)
    const accountNumber = String(body.accountNumber || '').trim()

    const request = await prisma.$transaction(async (tx) => {
      const debited = await tx.wallet.updateMany({
        where: { userId: sellerId, availableBalance: { gte: amount } },
        data: { availableBalance: { decrement: amount } },
      })
      if (!debited.count) {
        throw httpError('Amount cannot exceed your available balance', 400, 'InsufficientBalance')
      }
      return tx.withdrawalRequest.create({
        data: { userId: sellerId, amount, accountNumber, status: 'PENDING' },
      })
    })

    return {
      status: 201,
      body: {
        id: request.id,
        amount,
        status: payoutStatusLabel(request.status),
        message: 'Withdrawal requested',
      },
    }
  }

  /** Background sweep: orders without a decision in time go to carriers. */
  async sendUndecidedToCarriers() {
    const due = await prisma.order.findMany({
      where: {
        deliveryMode: null,
        deliveryDecisionDeadline: { lte: new Date() },
        orderStatus: { notIn: CLOSED_STATUSES },
      },
      select: { id: true, orderNumber: true },
      take: 20,
    })
    for (const order of due) {
      try {
        await auctionService.openSupplierAuctionForOrder(order.id)
      } catch (err) {
        console.error(`[supplier-delivery] auto auction failed for ${order.orderNumber}:`, err.message)
        if (err?.isOperational) {
          await prisma.order.update({ where: { id: order.id }, data: { deliveryMode: 'CARRIER' } })
        }
      }
    }
  }

  /** Admin: self-deliveries, optionally only the late ones. */
  async listForAdmin(query = {}) {
    const now = new Date()
    const lateOnly = String(query.late || '') === 'true'
    const rows = await prisma.order.findMany({
      where: {
        deliveryMode: 'SELF',
        orderStatus: { not: 'CANCELLED' },
        ...(lateOnly
          ? { selfDeliveryDeadline: { lt: now } }
          : {}),
      },
      include: {
        ...deliveryOrderInclude,
        seller: { select: { vatRate: true, name: true, email: true, profile: { select: { companyName: true } } } },
      },
      orderBy: { selfDeliveryDeadline: 'desc' },
      take: 100,
    })

    const mapped = rows
      .map((o) => ({
        ...mapDeliveryOrder(o, now),
        supplier: { name: companyDisplayName(o.seller) || partyName(o.seller), email: o.seller?.email || null },
      }))
      .filter((o) => !lateOnly || o.isLate)

    return {
      status: 200,
      body: { deliveries: mapped, message: 'Self deliveries fetched' },
    }
  }
}

export default new SupplierDeliveryService()
