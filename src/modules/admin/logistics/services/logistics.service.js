import prisma from '../../../../../lib/prisma.js'
import { httpError } from '../../../../shared/errors.js'
import { formatAddressLine } from '../../../../shared/address.js'
import { money } from '../../../../shared/money.js'
import { parsePagination, paginationMeta } from '../../../../shared/pagination.js'
import { companyDisplayName, partyName } from '../../../../shared/party.js'

const LOGISTICS_STATUSES = [
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'COMPLETED',
]

function assertAdmin(auth) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'admin') {
    throw httpError('Only admins can view logistics', 403, 'Forbidden')
  }
  return auth
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

function normalizeStatusQuery(raw) {
  if (!raw || raw === 'all') return { in: LOGISTICS_STATUSES }
  const s = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (s === 'assigned') return 'ASSIGNED'
  if (s === 'picked_up' || s === 'pickup') return 'PICKED_UP'
  if (s === 'in_transit') return 'IN_TRANSIT'
  if (s === 'delivered' || s === 'completed') return { in: ['DELIVERED', 'COMPLETED'] }
  return { in: LOGISTICS_STATUSES }
}

const listInclude = {
  shipment: {
    select: {
      pickupAddressText: true,
      deliveryAddressText: true,
      distanceKm: true,
      tripStartedAt: true,
      trackingEvents: {
        where: { statusText: { in: ['Picked Up', 'Delivered'] } },
        orderBy: { timestamp: 'desc' },
        take: 5,
        select: { statusText: true, timestamp: true },
      },
      order: {
        select: {
          orderNumber: true,
          orderStatus: true,
          grandTotal: true,
          orderLineItems: {
            take: 1,
            select: {
              quantity: true,
              totalPriceLocked: true,
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
    select: {
      bidAmount: true,
      transporterId: true,
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

const detailInclude = {
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
                  basePrice: true,
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

function mapAdminLogisticsCard(auction) {
  const shipment = auction.shipment
  const order = shipment.order
  const line = order.orderLineItems?.[0]
  const bid = auction.bids?.[0]
  const pickupEvent = shipment.trackingEvents?.find((e) => e.statusText === 'Picked Up')
  const delivered =
    order.orderStatus === 'DELIVERED' || order.orderStatus === 'COMPLETED'

  return {
    id: auction.id,
    auctionId: auction.auctionCode || null,
    deliveryId: delivered ? order.orderNumber : null,
    orderId: order.orderNumber,
    productName: line?.product?.title || null,
    status: statusLabel(order.orderStatus),
    price: money(bid?.bidAmount ?? order.grandTotal),
    distanceKm: shipment.distanceKm ?? null,
    pickupLocation: shipment.pickupAddressText,
    deliveryLocation: shipment.deliveryAddressText,
    pickedAt: pickupEvent?.timestamp || null,
    steps: stepper(order.orderStatus),
    transporterName:
      companyDisplayName(bid?.transporter) || partyName(bid?.transporter) || null,
  }
}

function mapAdminLogisticsDetails(auction) {
  const shipment = auction.shipment
  const order = shipment.order
  const line = order.orderLineItems?.[0]
  const product = line?.product
  const customer = order.customer
  const checkout = order.checkoutSession
  const bid = auction.bids?.[0]
  const transporter = bid?.transporter
  const delivered =
    order.orderStatus === 'DELIVERED' || order.orderStatus === 'COMPLETED'
  const totalWeight =
    product?.weightKg != null && line?.quantity != null
      ? Number(product.weightKg) * Number(line.quantity)
      : null

  return {
    id: auction.id,
    auctionId: auction.auctionCode || null,
    deliveryId: delivered ? order.orderNumber : null,
    orderId: order.orderNumber,
    status: statusLabel(order.orderStatus),
    summary: {
      auctionId: auction.auctionCode || null,
      auctionDate: auction.createdAt,
      deliveryCharge: money(bid?.bidAmount),
    },
    customer: {
      name: companyDisplayName(customer) || partyName(customer),
      phone: customer?.phoneNumber || checkout?.phone || null,
      email: customer?.email || checkout?.email || null,
      deliveryAddress: formatAddressLine(order.shippingAddress),
    },
    transporter: transporter
      ? {
          id: transporter.id,
          name: companyDisplayName(transporter) || partyName(transporter),
          phone: transporter.phoneNumber || null,
          email: transporter.email || null,
        }
      : null,
    shipping: {
      pickupLocation: shipment.pickupAddressText,
      unloadingInstructions:
        checkout?.unloadingLocationDescription ||
        shipment.deliveryAddressText ||
        null,
      accessCondition: checkout?.accessConditions || order.siteConditions || null,
      additionalNotes: checkout?.additionalNotes || null,
      deliveryLocation: shipment.deliveryAddressText,
      distanceKm: shipment.distanceKm ?? null,
    },
    product: {
      name: product?.title || null,
      sku: product?.sku || null,
      quantity: quantityText(line),
      weightKg: totalWeight,
      price: money(line?.totalPriceLocked ?? product?.basePrice),
    },
    steps: stepper(order.orderStatus),
    trackingEvents: (shipment.trackingEvents || []).map((e) => ({
      statusText: e.statusText,
      timestamp: e.timestamp,
    })),
  }
}

class AdminLogisticsService {
  async list(auth, query) {
    assertAdmin(auth)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 20,
      maxLimit: 100,
    })
    const statusFilter = normalizeStatusQuery(query.status)
    const search = String(query.search || '').trim()

    const and = [
      { auctionStatus: 'ASSIGNED' },
      { shipment: { order: { orderStatus: statusFilter } } },
    ]

    if (search) {
      and.push({
        OR: [
          { auctionCode: { contains: search, mode: 'insensitive' } },
          {
            shipment: {
              order: { orderNumber: { contains: search, mode: 'insensitive' } },
            },
          },
          {
            shipment: {
              order: {
                orderLineItems: {
                  some: {
                    product: { title: { contains: search, mode: 'insensitive' } },
                  },
                },
              },
            },
          },
          {
            shipment: {
              pickupAddressText: { contains: search, mode: 'insensitive' },
            },
          },
          {
            shipment: {
              deliveryAddressText: { contains: search, mode: 'insensitive' },
            },
          },
        ],
      })
    }

    const where = { AND: and }

    const [total, rows] = await Promise.all([
      prisma.shipmentAuction.count({ where }),
      prisma.shipmentAuction.findMany({
        where,
        include: listInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ])

    return {
      status: 200,
      body: {
        deliveries: rows.map(mapAdminLogisticsCard),
        pagination: paginationMeta({ page, limit, total }),
        filters: {
          status: String(query.status || 'all').toLowerCase(),
          search: search || null,
        },
        message: 'Logistics fetched',
      },
    }
  }

  async getById(auth, id) {
    assertAdmin(auth)
    const auction = await prisma.shipmentAuction.findFirst({
      where: {
        auctionStatus: 'ASSIGNED',
        OR: [{ id }, { auctionCode: id }],
      },
      include: detailInclude,
    })
    if (!auction) throw httpError('Logistics delivery not found', 404, 'NotFound')

    return {
      status: 200,
      body: {
        delivery: mapAdminLogisticsDetails(auction),
        message: 'Logistics details fetched',
      },
    }
  }
}

export default new AdminLogisticsService()
