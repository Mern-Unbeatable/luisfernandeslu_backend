import prisma from '../../../lib/prisma.js'
import { env } from '../../config/env.js'
import { sendMail } from '../../lib/mail.js'
import { httpError } from '../../shared/errors.js'
import { money } from '../../shared/money.js'
import { companyDisplayName, partyName } from '../../shared/party.js'
import { auctionPricePerKm, loadPlatformSettings } from '../admin/settings/settings.store.js'
import auctionService, {
  FACTORY_ROUTE_ORDER_INCLUDE,
  factoryOrderRoute,
} from '../auctions/services/auction.service.js'
import {
  createSplitPayment,
  getAdminSplitExternKey,
  getPaymentProvider,
  isMockPayments,
} from '../payments/eupago.client.js'
import { notifyPaymentFailure } from '../payments/payment-failure-notify.js'

const FACTORY_SOURCE = 'FACTORY_CONVERSION'

function assertRole(auth, role, message) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== role) {
    throw httpError(message, 403, 'Forbidden')
  }
  return auth.id
}

function methodEnum(method) {
  if (method === 'mbway') return 'MBWAY'
  if (method === 'creditcard') return 'CREDITCARD'
  return 'MULTIBANCO'
}

function transportPaymentNumber() {
  const time = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `TRP-${time}-${rand}`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function transportRequestMail({ to, orderNumber, amount }) {
  const url = `${env.frontendUrl}/supplier/factory-orders`
  const subject = `Order ${orderNumber}: pay the transport to receive your goods`
  const text = [
    `The factory has your order ${orderNumber} ready and asked Construpreço to deliver it.`,
    `Transport price: ${amount.toFixed(2)} EUR.`,
    'After you pay, carriers start bidding and the delivery is scheduled.',
    `Open: ${url}`,
  ].join('\n')
  const html = `
    <div style="font-family:sans-serif;max-width:520px">
      <h2>CONSTRUPRECO</h2>
      <p>The factory has your order <strong>${escapeHtml(orderNumber)}</strong> ready and asked Construpreço to deliver it.</p>
      <p>Transport price: <strong>${amount.toFixed(2)} EUR</strong>.</p>
      <p>After you pay, carriers start bidding and the delivery is scheduled.</p>
      <p><a href="${escapeHtml(url)}">Pay the transport</a></p>
    </div>
  `
  return { to, subject, text, html }
}

const supplierPaymentInclude = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      orderStatus: true,
      deliveryMode: true,
      deliveredAt: true,
      seller: { select: { name: true, email: true, profile: { select: { companyName: true } } } },
      shipment: {
        select: {
          pickupAddressText: true,
          deliveryAddressText: true,
          auction: {
            select: {
              auctionCode: true,
              auctionStatus: true,
              expiresAt: true,
              bids: {
                where: { status: 'ACCEPTED' },
                take: 1,
                select: {
                  bidAmount: true,
                  transporter: { select: { name: true, profile: { select: { companyName: true } } } },
                },
              },
            },
          },
        },
      },
    },
  },
}

function mapTransportPayment(row) {
  const order = row.order
  const auction = order?.shipment?.auction || null
  const winner = auction?.bids?.[0] || null
  return {
    id: row.id,
    paymentNumber: row.paymentNumber,
    orderId: order?.id || row.orderId,
    orderNumber: order?.orderNumber || null,
    orderStatus: order?.orderStatus || null,
    factory: order?.seller ? companyDisplayName(order.seller) || partyName(order.seller) : null,
    pickupLocation: order?.shipment?.pickupAddressText || null,
    deliveryLocation: order?.shipment?.deliveryAddressText || null,
    requiredVehicleType: row.requiredVehicleType,
    distanceKm: row.distanceKm,
    pricePerKm: row.pricePerKm,
    amount: money(row.amount),
    status: row.status,
    paymentMethod: row.paymentMethod,
    entity: row.eupagoEntity,
    reference: row.eupagoReference,
    paidAt: row.paidAt,
    auction: auction
      ? {
          code: auction.auctionCode,
          status: auction.auctionStatus,
          expiresAt: auction.expiresAt,
          transporter: winner ? partyName(winner.transporter) : null,
        }
      : null,
    createdAt: row.createdAt,
  }
}

class FactoryTransportService {
  async loadFactoryOrder(factoryId, orderId) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, sellerId: factoryId, orderSource: FACTORY_SOURCE },
      include: {
        ...FACTORY_ROUTE_ORDER_INCLUDE,
        customer: { select: { ...FACTORY_ROUTE_ORDER_INCLUDE.customer.select, email: true } },
        checkoutSession: { select: { paymentStatus: true } },
        transportPayment: true,
      },
    })
    if (!order) throw httpError('Factory order not found', 404, 'NotFound')
    if (order.checkoutSession?.paymentStatus !== 'PAID') {
      throw httpError('This order is not paid yet', 409, 'OrderNotPaid')
    }
    return order
  }

  /**
   * Factory decides how a READY order reaches the supplier:
   * PLATFORM → Construpreço transport, the supplier pays it before carriers bid;
   * SELF → the factory delivers it, nothing is charged.
   * The choice can change until the supplier pays the transport.
   */
  async chooseTransport(auth, orderId, body = {}) {
    const factoryId = assertRole(auth, 'factory', 'Only factories can choose the transport')
    const order = await this.loadFactoryOrder(factoryId, orderId)
    if (order.orderStatus !== 'READY') {
      throw httpError('Mark the order as Ready before choosing the transport', 409, 'OrderNotReady')
    }
    if (order.transportPayment?.status === 'PAID') {
      throw httpError('The supplier already paid the transport', 409, 'TransportPaid')
    }

    if (body.mode === 'SELF') {
      await prisma.$transaction(async (tx) => {
        if (order.transportPayment) {
          await tx.transportPayment.update({
            where: { id: order.transportPayment.id },
            data: { status: 'CANCELLED' },
          })
        }
        await tx.order.update({
          where: { id: order.id },
          data: {
            deliveryMode: 'SELF',
            statusHistory: {
              create: { status: order.orderStatus, note: 'Factory will deliver the order itself' },
            },
          },
        })
      })
      return {
        status: 200,
        body: { orderId: order.id, deliveryMode: 'SELF', message: 'You will deliver this order' },
      }
    }

    const requiredVehicleType = body.requiredVehicleType
    const route = await factoryOrderRoute(order)
    const pricePerKm = auctionPricePerKm(await loadPlatformSettings(), requiredVehicleType)
    const amount = money(route.distanceKm * pricePerKm)
    if (!(amount > 0)) {
      throw httpError('Could not calculate the transport price', 400, 'TransportPriceInvalid')
    }

    const payment = await prisma.$transaction(async (tx) => {
      await tx.shipment.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          pickupAddressText: route.pickupText,
          deliveryAddressText: route.deliveryText,
          distanceKm: route.distanceKm,
        },
        update: {
          pickupAddressText: route.pickupText,
          deliveryAddressText: route.deliveryText,
          distanceKm: route.distanceKm,
        },
      })
      const data = {
        payerId: order.customerId,
        requiredVehicleType,
        distanceKm: route.distanceKm,
        pricePerKm,
        amount,
        status: 'PENDING_PAYMENT',
        paymentMethod: null,
        eupagoReference: null,
        eupagoEntity: null,
        eupagoTransactionId: null,
      }
      const saved = await tx.transportPayment.upsert({
        where: { orderId: order.id },
        create: { ...data, orderId: order.id, paymentNumber: transportPaymentNumber() },
        update: data,
      })
      await tx.order.update({
        where: { id: order.id },
        data: {
          deliveryMode: 'CARRIER',
          statusHistory: {
            create: {
              status: order.orderStatus,
              note: `Factory requested platform transport (${amount.toFixed(2)} EUR) — waiting for supplier payment`,
            },
          },
        },
      })
      return saved
    })

    if (order.customer?.email) {
      sendMail(
        transportRequestMail({ to: order.customer.email, orderNumber: order.orderNumber, amount }),
      ).catch((err) => console.error('[factory-transport] mail failed', err.message))
    }

    return {
      status: 200,
      body: {
        orderId: order.id,
        deliveryMode: 'CARRIER',
        transportPayment: {
          id: payment.id,
          amount,
          distanceKm: route.distanceKm,
          pricePerKm,
          requiredVehicleType,
          status: payment.status,
        },
        message: 'Transport requested — the supplier must pay it before carriers bid',
      },
    }
  }

  async markDelivered(auth, orderId) {
    const factoryId = assertRole(auth, 'factory', 'Only factories can mark deliveries')
    const order = await this.loadFactoryOrder(factoryId, orderId)
    if (order.deliveryMode !== 'SELF') {
      throw httpError('Only orders you deliver yourself can be marked as delivered', 400, 'NotSelfDelivery')
    }
    if (order.deliveredAt || ['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(order.orderStatus)) {
      throw httpError('This order is already closed', 409, 'AlreadyDelivered')
    }
    if (order.orderStatus !== 'READY') {
      throw httpError('Only Ready orders can be marked as delivered', 409, 'OrderNotReady')
    }

    const deliveredAt = new Date()
    await prisma.order.update({
      where: { id: order.id },
      data: {
        orderStatus: 'DELIVERED',
        deliveredAt,
        statusHistory: { create: { status: 'DELIVERED', note: 'Delivered by the factory' } },
      },
    })
    return {
      status: 200,
      body: { orderId: order.id, deliveredAt, message: 'Order marked as delivered' },
    }
  }

  async listForSupplier(auth) {
    const supplierId = assertRole(auth, 'supplier', 'Only suppliers can see transport payments')
    const rows = await prisma.transportPayment.findMany({
      where: { payerId: supplierId, status: { not: 'CANCELLED' } },
      include: supplierPaymentInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return {
      status: 200,
      body: { transportPayments: rows.map(mapTransportPayment), message: 'Transport payments fetched' },
    }
  }

  async payForSupplier(auth, orderId, body = {}) {
    const supplierId = assertRole(auth, 'supplier', 'Only suppliers can pay the transport')
    const payment = await prisma.transportPayment.findFirst({
      where: { orderId, payerId: supplierId },
      include: { order: { select: { orderNumber: true, sellerId: true } } },
    })
    if (!payment) throw httpError('Transport payment not found', 404, 'NotFound')
    if (payment.status === 'PAID') throw httpError('The transport is already paid', 409, 'AlreadyPaid')
    if (payment.status === 'CANCELLED') {
      throw httpError('The factory will deliver this order itself', 409, 'TransportCancelled')
    }

    const paymentMethod = String(body.paymentMethod || 'multibanco').toLowerCase()
    const paymentNumber = transportPaymentNumber()
    const amount = money(payment.amount)
    const adminExternKey = await getAdminSplitExternKey()

    let eupago
    try {
      eupago = await createSplitPayment({
        paymentMethod,
        amount,
        identifier: paymentNumber,
        alias: body.mbwayPhone,
        adminCallback: env.payments.eupago.callbackUrl || undefined,
        successUrl: `${env.frontendUrl}/supplier/factory-orders`,
        cancelUrl: `${env.frontendUrl}/supplier/factory-orders`,
        beneficiaries: [
          { externKey: adminExternKey, amount, identifier: `${paymentNumber}-transport` },
        ],
      })
    } catch (err) {
      await prisma.transportPayment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', paymentNumber },
      })
      void notifyPaymentFailure({
        sellerIds: [],
        buyerId: supplierId,
        checkoutNumber: paymentNumber,
        amount,
        paymentMethod,
        error: err,
      })
      throw httpError(
        err.message || 'Payment provider error',
        err.statusCode || 502,
        err.code || 'EupagoError',
        err.details,
      )
    }

    const redirectUrl = eupago.url || eupago.raw?.redirectUrl || eupago.raw?.url || null
    const updated = await prisma.transportPayment.update({
      where: { id: payment.id },
      data: {
        paymentNumber,
        status: 'PENDING_PAYMENT',
        paymentMethod: methodEnum(paymentMethod),
        eupagoEntity: eupago.entity,
        eupagoReference: eupago.reference || redirectUrl,
        eupagoTransactionId: eupago.raw?.transactionID || eupago.raw?.transactionId || null,
      },
    })

    if (isMockPayments()) {
      await this.markPaid(updated, 'Mock transport payment confirmed')
    }

    const fresh = await prisma.transportPayment.findUnique({
      where: { id: payment.id },
      include: supplierPaymentInclude,
    })
    return {
      status: 200,
      body: {
        transportPayment: mapTransportPayment(fresh),
        payment: {
          provider: getPaymentProvider(),
          entity: updated.eupagoEntity,
          reference: updated.eupagoReference,
          url: redirectUrl,
        },
        message: fresh.status === 'PAID' ? 'Transport paid — carriers can bid now' : 'Complete the payment to open the transport',
      },
    }
  }

  /** Marks the transport paid exactly once and opens the carrier auction. */
  async markPaid(payment, note = 'Transport payment confirmed') {
    const claimed = await prisma.transportPayment.updateMany({
      where: { id: payment.id, status: { in: ['PENDING_PAYMENT', 'FAILED'] } },
      data: { status: 'PAID', paidAt: new Date() },
    })
    if (!claimed.count) return { alreadyPaid: true }

    await prisma.orderStatusHistory.create({
      data: { orderId: payment.orderId, status: 'READY', note },
    })
    try {
      await auctionService.openFactoryAuction({
        orderId: payment.orderId,
        requiredVehicleType: payment.requiredVehicleType,
        bidStartPrice: money(payment.amount),
      })
    } catch (err) {
      console.error('[factory-transport] auction open failed', payment.orderId, err.message)
    }
    return { alreadyPaid: false }
  }

  /** EuPago callback for transport payments; returns null when the reference is not a transport payment. */
  async handleWebhook({ reference, identifier, amount }) {
    const or = []
    if (reference) or.push({ eupagoReference: String(reference) })
    if (identifier) or.push({ paymentNumber: String(identifier) })
    if (!or.length) return null

    const payment = await prisma.transportPayment.findFirst({ where: { OR: or } })
    if (!payment) return null

    if (amount != null && Math.abs(Number(amount) - Number(payment.amount)) > 0.01) {
      throw httpError('Paid amount does not match the transport price', 400, 'AmountMismatch')
    }
    if (payment.status === 'PAID') {
      return { status: 200, body: { id: payment.id, paymentStatus: 'PAID', message: 'Already paid' } }
    }
    if (payment.status === 'CANCELLED') {
      throw httpError('Transport payment was cancelled', 409, 'TransportCancelled')
    }

    await this.markPaid(payment, 'Transport paid via EuPago')
    return { status: 200, body: { id: payment.id, paymentStatus: 'PAID', message: 'Transport payment confirmed' } }
  }
}

export default new FactoryTransportService()
