import crypto from 'node:crypto'
import prisma from '../../../../lib/prisma.js'
import { httpError } from '../../../shared/errors.js'
import { formatAddressLine } from '../../../shared/address.js'
import { money } from '../../../shared/money.js'
import { parsePagination, paginationMeta } from '../../../shared/pagination.js'
import { companyDisplayName, partyName } from '../../../shared/party.js'

const ACTIVE_STATUSES = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT']

function assertRole(auth, role, message) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== role) {
    throw httpError(message, 403, 'Forbidden')
  }
  return auth.id
}

function quantityText(line) {
  if (!line) return null
  const qty = line.quantity
  const unit = line.product?.unitOfMeasure || 'pcs'
  const weight = line.product?.weightKg
  if (weight) return `${qty} ${unit} (${weight}kg each)`
  return `${qty} ${unit}`
}

function statusLabel(orderStatus) {
  if (orderStatus === 'ASSIGNED') return 'Assigned'
  if (orderStatus === 'PICKED_UP') return 'Picked Up'
  if (orderStatus === 'IN_TRANSIT') return 'In Transit'
  if (orderStatus === 'DELIVERED' || orderStatus === 'COMPLETED') return 'Delivered'
  return orderStatus
}

function deliveryActions(order, shipment) {
  const s = order.orderStatus
  const tripStarted = Boolean(shipment?.tripStartedAt)
  const otpSent = Boolean(order.otpVerificationCode)
  return {
    canStartTrip: s === 'ASSIGNED' && !tripStarted,
    canMarkPickedUp: s === 'ASSIGNED' && tripStarted,
    canNavigateToDelivery: s === 'PICKED_UP',
    canVerifyDelivery: s === 'IN_TRANSIT',
    canSeeDetails: true,
    otpSent,
  }
}

function stepper(orderStatus) {
  const rank = {
    ASSIGNED: 1,
    PICKED_UP: 2,
    IN_TRANSIT: 3,
    DELIVERED: 4,
    COMPLETED: 4,
  }
  const current = rank[orderStatus] || 1
  return [
    { key: 'ASSIGNED', label: 'Assigned', done: current >= 1, current: current === 1 },
    { key: 'PICKED_UP', label: 'Picked Up', done: current >= 2, current: current === 2 },
    { key: 'IN_TRANSIT', label: 'In Transit', done: current >= 3, current: current === 3 },
    { key: 'DELIVERED', label: 'Delivered', done: current >= 4, current: current === 4 },
  ]
}

function assignedWhere(transporterId, statusFilter) {
  const orderStatus = statusFilter || { in: ACTIVE_STATUSES }
  return {
    auctionStatus: 'ASSIGNED',
    bids: { some: { transporterId, status: 'ACCEPTED' } },
    shipment: { order: { orderStatus } },
  }
}

const assignedInclude = {
  shipment: {
    include: {
      trackingEvents: { orderBy: { timestamp: 'desc' } },
      order: {
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
              profile: { select: { companyName: true } },
            },
          },
          shippingAddress: true,
          checkoutSession: {
            select: {
              email: true,
              phone: true,
              firstName: true,
              lastName: true,
              unloadingLocationDescription: true,
              accessConditions: true,
              additionalNotes: true,
            },
          },
          project: { select: { projectName: true, location: true } },
          orderLineItems: {
            take: 1,
            include: {
              product: {
                select: {
                  title: true,
                  sku: true,
                  unitOfMeasure: true,
                  weightKg: true,
                },
              },
            },
          },
        },
      },
    },
  },
  bids: {
    where: { status: 'ACCEPTED' },
    take: 1,
    include: {
      transporter: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          profile: { select: { companyName: true } },
        },
      },
    },
  },
}

function mapDeliveryCard(auction) {
  const shipment = auction.shipment
  const order = shipment.order
  const line = order.orderLineItems?.[0]
  const bid = auction.bids?.[0]
  const pickupEvent = shipment.trackingEvents?.find(
    (e) => e.statusText === 'Picked Up',
  )
  return {
    auctionId: auction.id,
    orderId: order.orderNumber,
    productName: line?.product?.title || null,
    status: statusLabel(order.orderStatus),
    orderStatus: order.orderStatus,
    bidAmount: money(bid?.bidAmount),
    distanceKm: shipment.distanceKm ?? null,
    pickupLocation: shipment.pickupAddressText,
    deliveryLocation: shipment.deliveryAddressText,
    pickedAt: pickupEvent?.timestamp || null,
    actions: deliveryActions(order, shipment),
  }
}

function mapDeliveryDetails(auction) {
  const shipment = auction.shipment
  const order = shipment.order
  const line = order.orderLineItems?.[0]
  const product = line?.product
  const customer = order.customer
  const checkout = order.checkoutSession
  const bid = auction.bids?.[0]
  return {
    auctionId: auction.id,
    orderId: order.orderNumber,
    status: statusLabel(order.orderStatus),
    orderStatus: order.orderStatus,
    auctionDate: auction.createdAt,
    bidAmount: money(bid?.bidAmount),
    distanceKm: shipment.distanceKm ?? null,
    quantity: quantityText(line),
    customer: {
      name: companyDisplayName(customer) || partyName(customer),
      email: customer?.email || checkout?.email || null,
      phone: customer?.phoneNumber || checkout?.phone || null,
      deliveryAddress: formatAddressLine(order.shippingAddress),
    },
    shipping: {
      pickupLocation: shipment.pickupAddressText,
      deliveryLocation: shipment.deliveryAddressText,
      unloadingInstructions: checkout?.unloadingLocationDescription || null,
      accessCondition: checkout?.accessConditions || order.siteConditions || null,
      additionalNotes: checkout?.additionalNotes || null,
    },
    product: {
      name: product?.title || null,
      sku: product?.sku || null,
      weightKg: product?.weightKg ?? null,
    },
    steps: stepper(order.orderStatus),
    actions: deliveryActions(order, shipment),
    assignedTransporter: bid
      ? {
          id: bid.transporterId,
          name: partyName(bid.transporter),
          bidAmount: money(bid.bidAmount),
        }
      : null,
  }
}

function normalizeStatusQuery(raw) {
  if (!raw || raw === 'all') return { in: ACTIVE_STATUSES }
  const s = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (s === 'assigned') return 'ASSIGNED'
  if (s === 'picked_up' || s === 'pickup') return 'PICKED_UP'
  if (s === 'in_transit') return 'IN_TRANSIT'
  if (s === 'delivered' || s === 'completed') return { in: ['DELIVERED', 'COMPLETED'] }
  return { in: ACTIVE_STATUSES }
}

class DeliveryService {
  async findAssignedAuctionLite(transporterId, auctionId) {
    const auction = await prisma.shipmentAuction.findFirst({
      where: {
        id: auctionId,
        auctionStatus: 'ASSIGNED',
        bids: { some: { transporterId, status: 'ACCEPTED' } },
      },
      select: {
        id: true,
        shipment: {
          select: {
            id: true,
            tripStartedAt: true,
            order: {
              select: {
                id: true,
                orderNumber: true,
                orderStatus: true,
                otpVerificationCode: true,
                customer: { select: { email: true } },
                checkoutSession: { select: { email: true } },
              },
            },
          },
        },
      },
    })
    if (!auction) throw httpError('Assigned delivery not found', 404, 'NotFound')
    return auction
  }

  mutationOk(id, message, status = 200) {
    return { status, body: { id, message } }
  }

  async findAssignedAuction(transporterId, auctionId) {
    const auction = await prisma.shipmentAuction.findFirst({
      where: {
        id: auctionId,
        auctionStatus: 'ASSIGNED',
        bids: { some: { transporterId, status: 'ACCEPTED' } },
      },
      include: assignedInclude,
    })
    if (!auction) throw httpError('Assigned delivery not found', 404, 'NotFound')
    return auction
  }

  async listForTransporter(auth, query) {
    const transporterId = assertRole(
      auth,
      'transporter',
      'Only transporters can list assigned deliveries',
    )
    const { page, limit, skip, take } = parsePagination(query, { defaultLimit: 20 })
    const where = assignedWhere(transporterId, normalizeStatusQuery(query.status))

    const [total, auctions] = await Promise.all([
      prisma.shipmentAuction.count({ where }),
      prisma.shipmentAuction.findMany({
        where,
        include: assignedInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ])

    return {
      status: 200,
      body: {
        deliveries: auctions.map(mapDeliveryCard),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Assigned deliveries fetched',
      },
    }
  }

  async getForTransporter(auth, auctionId) {
    const transporterId = assertRole(
      auth,
      'transporter',
      'Only transporters can view assigned deliveries',
    )
    const auction = await this.findAssignedAuction(transporterId, auctionId)
    return {
      status: 200,
      body: {
        delivery: mapDeliveryDetails(auction),
        message: 'Assigned delivery details fetched',
      },
    }
  }

  async updateStatus(auth, auctionId, action) {
    const transporterId = assertRole(
      auth,
      'transporter',
      'Only transporters can update delivery status',
    )
    const auction = await this.findAssignedAuctionLite(transporterId, auctionId)
    const order = auction.shipment.order
    const shipment = auction.shipment
    const key = String(action || '').trim().toUpperCase()

    if (key === 'START_TRIP') {
      if (order.orderStatus !== 'ASSIGNED') {
        throw httpError('Trip can only start from Assigned', 400, 'InvalidStatus')
      }
      if (shipment.tripStartedAt) {
        throw httpError('Trip already started', 409, 'Conflict')
      }
      await prisma.$transaction([
        prisma.shipment.update({
          where: { id: shipment.id },
          data: { tripStartedAt: new Date() },
        }),
        prisma.trackingEvent.create({
          data: { shipmentId: shipment.id, statusText: 'Trip Started' },
        }),
      ])
      return this.mutationOk(auctionId, 'Trip started')
    }

    if (key === 'MARK_PICKED_UP') {
      if (order.orderStatus !== 'ASSIGNED' || !shipment.tripStartedAt) {
        throw httpError(
          'Start trip before marking picked up',
          400,
          'InvalidStatus',
        )
      }
      await prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: {
            orderStatus: 'PICKED_UP',
            statusHistory: {
              create: { status: 'PICKED_UP', note: 'Transporter marked picked up' },
            },
          },
        }),
        prisma.trackingEvent.create({
          data: { shipmentId: shipment.id, statusText: 'Picked Up' },
        }),
      ])
      return this.mutationOk(auctionId, 'Marked picked up')
    }

    if (key === 'NAVIGATE_TO_DELIVERY') {
      if (order.orderStatus !== 'PICKED_UP') {
        throw httpError(
          'Navigate to delivery is only allowed after pickup',
          400,
          'InvalidStatus',
        )
      }
      await prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: {
            orderStatus: 'IN_TRANSIT',
            statusHistory: {
              create: { status: 'IN_TRANSIT', note: 'Transporter navigating to delivery' },
            },
          },
        }),
        prisma.trackingEvent.create({
          data: { shipmentId: shipment.id, statusText: 'In Transit' },
        }),
      ])
      return this.mutationOk(auctionId, 'Navigating to delivery')
    }

    if (key === 'VERIFY_DELIVERY') {
      if (order.orderStatus !== 'IN_TRANSIT') {
        throw httpError(
          'Delivery verification is only allowed while in transit',
          400,
          'InvalidStatus',
        )
      }
      const otp = String(crypto.randomInt(1000, 10000))
      await prisma.order.update({
        where: { id: order.id },
        data: { otpVerificationCode: otp },
      })
      console.info(
        `[delivery-otp] order=${order.orderNumber} auctionId=${auctionId} otp=${otp}`,
      )
      return this.mutationOk(auctionId, 'Delivery OTP sent to customer')
    }

    throw httpError('Unknown delivery action', 400, 'InvalidAction')
  }

  async verifyOtp(auth, auctionId, otp) {
    const transporterId = assertRole(
      auth,
      'transporter',
      'Only transporters can verify delivery OTP',
    )
    const auction = await this.findAssignedAuctionLite(transporterId, auctionId)
    const order = auction.shipment.order

    if (order.orderStatus !== 'IN_TRANSIT') {
      throw httpError('OTP can only be verified while in transit', 400, 'InvalidStatus')
    }
    if (!order.otpVerificationCode) {
      throw httpError('Request delivery OTP first', 400, 'OtpNotSent')
    }
    if (String(otp || '').trim() !== String(order.otpVerificationCode)) {
      throw httpError('Invalid delivery OTP', 400, 'InvalidOtp')
    }

    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: {
          orderStatus: 'COMPLETED',
          otpVerificationCode: null,
          statusHistory: {
            create: { status: 'COMPLETED', note: 'Delivery verified with customer OTP' },
          },
        },
      }),
      prisma.trackingEvent.create({
        data: { shipmentId: auction.shipment.id, statusText: 'Delivered' },
      }),
    ])

    return this.mutationOk(auctionId, 'Delivery verified')
  }

  async listForBuyer(auth, query) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    const role = String(auth.role || '').toLowerCase()
    if (role !== 'customer' && role !== 'company') {
      throw httpError('Only buyers can list orders', 403, 'Forbidden')
    }
    const { page, limit, skip, take } = parsePagination(query, { defaultLimit: 20 })
    const where = { customerId: auth.id }
    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          otpVerificationCode: true,
          createdAt: true,
          orderLineItems: {
            take: 1,
            select: { product: { select: { title: true } } },
          },
        },
      }),
    ])

    return {
      status: 200,
      body: {
        orders: orders.map((o) => ({
          orderId: o.orderNumber,
          productName: o.orderLineItems?.[0]?.product?.title || null,
          status: statusLabel(o.orderStatus),
          orderStatus: o.orderStatus,
          createdAt: o.createdAt,
          deliveryOtp:
            o.orderStatus === 'IN_TRANSIT' ? o.otpVerificationCode : null,
        })),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Orders fetched',
      },
    }
  }

  async getForBuyer(auth, orderRef) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    const role = String(auth.role || '').toLowerCase()
    if (role !== 'customer' && role !== 'company') {
      throw httpError('Only buyers can view orders', 403, 'Forbidden')
    }
    const order = await prisma.order.findFirst({
      where: {
        customerId: auth.id,
        OR: [{ id: orderRef }, { orderNumber: orderRef }],
      },
      select: {
        id: true,
        orderNumber: true,
        orderStatus: true,
        otpVerificationCode: true,
        createdAt: true,
        shippingAddress: true,
        orderLineItems: {
          take: 1,
          select: {
            quantity: true,
            product: { select: { title: true, sku: true, weightKg: true } },
          },
        },
      },
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')

    return {
      status: 200,
      body: {
        order: {
          orderId: order.orderNumber,
          status: statusLabel(order.orderStatus),
          orderStatus: order.orderStatus,
          createdAt: order.createdAt,
          productName: order.orderLineItems?.[0]?.product?.title || null,
          deliveryAddress: formatAddressLine(order.shippingAddress),
          deliveryOtp:
            order.orderStatus === 'IN_TRANSIT' ? order.otpVerificationCode : null,
        },
        message: 'Order details fetched',
      },
    }
  }
}

export default new DeliveryService()
