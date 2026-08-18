import prisma from '../../../../lib/prisma.js'
import { env } from '../../../config/env.js'
import { httpError } from '../../../shared/errors.js'
import { formatAddressLine } from '../../../shared/address.js'
import { money } from '../../../shared/money.js'
import { parsePagination, paginationMeta } from '../../../shared/pagination.js'
import { companyDisplayName, partyName } from '../../../shared/party.js'

function assertRole(auth, role, message) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== role) {
    throw httpError(message, 403, 'Forbidden')
  }
  return auth.id
}

function pickLocations(order) {
  const ship = order.shippingAddress
  const pickupLocation =
    order.shipment?.pickupAddressText ||
    order.project?.location ||
    order.project?.projectName ||
    formatAddressLine(ship) ||
    'Pickup location not set'
  const deliveryLocation =
    order.shipment?.deliveryAddressText ||
    formatAddressLine(ship) ||
    'Delivery location not set'
  return { pickupLocation, deliveryLocation }
}

function quantityText(line) {
  if (!line) return null
  const qty = line.quantity
  const unit = line.product?.unitOfMeasure || 'pcs'
  const weight = line.product?.weightKg
  if (weight) return `${qty} ${unit} (${weight}kg each)`
  return `${qty} ${unit}`
}

function mapAuctionCard(auction) {
  const order = auction.shipment.order
  const product = order.orderLineItems?.[0]?.product
  const customerName =
    companyDisplayName(order.customer) ||
    partyName(order.customer) ||
    [order.checkoutSession?.firstName, order.checkoutSession?.lastName]
      .filter(Boolean)
      .join(' ') ||
    null
  const { pickupLocation, deliveryLocation } = pickLocations(order)
  const bidStartFrom = money(order.shippingFee)
  return {
    auctionId: auction.id,
    orderId: order.orderNumber,
    orderDbId: order.id,
    orderNumber: order.orderNumber,
    auctionStatus: auction.auctionStatus,
    orderStatus: order.orderStatus,
    requiredVehicleType: auction.requiredVehicleType,
    shippingCharge: bidStartFrom,
    maxAllowedBid: bidStartFrom,
    expiresAt: auction.expiresAt,
    createdAt: auction.createdAt,
    customerName,
    pickupLocation,
    deliveryLocation,
    productName: product?.title || null,
    totalBids: auction._count?.bids ?? auction.bids?.length ?? 0,
  }
}

function mapTransporterAuctionCard(auction, transporterId) {
  const shipment = auction.shipment
  const order = shipment.order
  const line = order.orderLineItems?.[0]
  const bids = (auction.bids || []).map((b) => ({
    bidId: b.id,
    bidAmount: money(b.bidAmount),
    createdAt: b.createdAt,
    isMine: b.transporterId === transporterId,
  }))
  const myBid = bids.find((b) => b.isMine) || null

  return {
    auctionId: auction.id,
    productName: line?.product?.title || null,
    auctionStatus: auction.auctionStatus,
    isEnded: auction.auctionStatus !== 'PENDING_BIDS' || auction.expiresAt <= new Date(),
    canBid:
      auction.auctionStatus === 'PENDING_BIDS' && auction.expiresAt > new Date(),
    expiresAt: auction.expiresAt,
    quantity: quantityText(line),
    pickupLocation: shipment.pickupAddressText || pickLocations(order).pickupLocation,
    deliveryLocation:
      shipment.deliveryAddressText || pickLocations(order).deliveryLocation,
    distanceKm: shipment.distanceKm ?? null,
    bidStartFrom: money(order.shippingFee),
    bids,
    myBid,
  }
}

function mapAuctionDetails(auction) {
  const order = auction.shipment.order
  const first = order.orderLineItems?.[0]?.product
  const customer = order.customer
  const { pickupLocation, deliveryLocation } = pickLocations(order)
  const acceptedBid =
    auction.bids?.find((b) => b.status === 'ACCEPTED') ||
    auction.bids?.[0] ||
    null
  const checkout = order.checkoutSession

  return {
    auctionId: auction.id,
    auctionStatus: auction.auctionStatus,
    order: {
      id: order.orderNumber,
      dbId: order.id,
      orderNumber: order.orderNumber,
      status: order.orderStatus,
      auctionDate: auction.createdAt,
    },
    customer: {
      id: customer?.id || null,
      name: companyDisplayName(customer) || partyName(customer),
      email: customer?.email || checkout?.email || null,
      phone: customer?.phoneNumber || checkout?.phone || null,
      deliveryAddress: formatAddressLine(order.shippingAddress),
    },
    shipping: {
      pickupLocation,
      deliveryLocation,
      unloadingInstructions: checkout?.unloadingLocationDescription || null,
      accessCondition: checkout?.accessConditions || order.siteConditions || null,
      additionalNotes: checkout?.additionalNotes || null,
    },
    product: {
      name: first?.title || null,
      sku: first?.sku || null,
      weightKg: first?.weightKg ?? null,
      price: money(order.shippingFee),
    },
    bidSummary: {
      shippingCharge: money(order.shippingFee),
      lowestBid: acceptedBid ? money(acceptedBid.bidAmount) : null,
      totalBids: auction.bids?.length || 0,
    },
    bids: (auction.bids || []).map((b) => ({
      id: b.id,
      transporterId: b.transporterId,
      transporterName: partyName(b.transporter),
      bidAmount: money(b.bidAmount),
      status: b.status,
      createdAt: b.createdAt,
    })),
    assignedTransporter: acceptedBid
      ? {
          id: acceptedBid.transporterId,
          name: partyName(acceptedBid.transporter),
          email: acceptedBid.transporter?.email || null,
          phone: acceptedBid.transporter?.phoneNumber || null,
          bidAmount: money(acceptedBid.bidAmount),
          assignedAt: acceptedBid.createdAt,
        }
      : null,
  }
}

class AuctionService {
  orderLookup(orderRef, supplierId) {
    return {
      sellerId: supplierId,
      OR: [{ id: orderRef }, { orderNumber: orderRef }],
    }
  }

  async finalizeAuctionIfExpired(auctionId) {
    const auction = await prisma.shipmentAuction.findUnique({
      where: { id: auctionId },
      select: {
        id: true,
        auctionStatus: true,
        expiresAt: true,
        shipment: { select: { orderId: true } },
        bids: {
          where: { status: 'SUBMITTED' },
          orderBy: [{ bidAmount: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, transporterId: true },
        },
      },
    })
    if (!auction) return
    if (auction.auctionStatus !== 'PENDING_BIDS') return
    if (auction.expiresAt > new Date()) return

    const winner = auction.bids?.[0] || null

    await prisma.$transaction(async (tx) => {
      const fresh = await tx.shipmentAuction.findUnique({
        where: { id: auctionId },
        select: { auctionStatus: true, expiresAt: true },
      })
      if (!fresh) return
      if (fresh.auctionStatus !== 'PENDING_BIDS') return
      if (fresh.expiresAt > new Date()) return

      if (!winner) {
        await tx.shipmentAuction.update({
          where: { id: auctionId },
          data: { auctionStatus: 'EXPIRED' },
        })
        return
      }

      await tx.shipmentAuction.update({
        where: { id: auctionId },
        data: { auctionStatus: 'ASSIGNED' },
      })

      await tx.transporterBid.updateMany({
        where: { auctionId, status: 'SUBMITTED' },
        data: { status: 'REJECTED' },
      })

      await tx.transporterBid.update({
        where: { id: winner.id },
        data: { status: 'ACCEPTED' },
      })

      await tx.order.update({
        where: { id: auction.shipment.orderId },
        data: {
          orderStatus: 'ASSIGNED',
          statusHistory: {
            create: {
              status: 'ASSIGNED',
              note: 'Transporter auto-assigned from lowest shipment auction bid',
            },
          },
        },
      })
    })
  }

  async createForSupplier(auth, body) {
    const supplierId = assertRole(
      auth,
      'supplier',
      'Only suppliers can create shipment auctions',
    )

    const orderRef = String(body.orderId || '').trim()
    const order = await prisma.order.findFirst({
      where: this.orderLookup(orderRef, supplierId),
      include: {
        shippingAddress: true,
        project: { select: { projectName: true, location: true } },
      },
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')

    if (!(Number(order.shippingFee) > 0)) {
      throw httpError(
        'Order shipping charge must be greater than 0',
        400,
        'InvalidShippingCharge',
      )
    }

    const durationMs = env.auctionDurationMinutes * 60 * 1000
    const expiresAt = new Date(Date.now() + durationMs)

    const shipment = await prisma.shipment.upsert({
      where: { orderId: order.id },
      update: {
        pickupAddressText:
          order.project?.location ||
          order.project?.projectName ||
          formatAddressLine(order.shippingAddress) ||
          'Pickup location not set',
        deliveryAddressText:
          formatAddressLine(order.shippingAddress) || 'Delivery location not set',
      },
      create: {
        orderId: order.id,
        pickupAddressText:
          order.project?.location ||
          order.project?.projectName ||
          formatAddressLine(order.shippingAddress) ||
          'Pickup location not set',
        deliveryAddressText:
          formatAddressLine(order.shippingAddress) || 'Delivery location not set',
      },
      select: { id: true },
    })

    const existing = await prisma.shipmentAuction.findUnique({
      where: { shipmentId: shipment.id },
      select: { id: true, auctionStatus: true, expiresAt: true },
    })

    let auction
    if (!existing) {
      auction = await prisma.shipmentAuction.create({
        data: {
          shipmentId: shipment.id,
          requiredVehicleType: body.requiredVehicleType,
          expiresAt,
          auctionStatus: 'PENDING_BIDS',
        },
      })
    } else {
      if (existing.auctionStatus === 'PENDING_BIDS' && existing.expiresAt > new Date()) {
        throw httpError('An active auction already exists for this order', 409, 'Conflict')
      }
      if (existing.auctionStatus === 'ASSIGNED') {
        throw httpError(
          'Transporter already assigned for this order auction',
          409,
          'AlreadyAssigned',
        )
      }

      await prisma.transporterBid.deleteMany({ where: { auctionId: existing.id } })
      auction = await prisma.shipmentAuction.update({
        where: { id: existing.id },
        data: {
          requiredVehicleType: body.requiredVehicleType,
          expiresAt,
          auctionStatus: 'PENDING_BIDS',
          createdAt: new Date(),
        },
      })
    }

    return {
      status: 201,
      body: {
        id: auction.id,
        message: 'Shipment auction created',
      },
    }
  }

  async getCreateInfoForSupplier(auth, orderId) {
    const supplierId = assertRole(
      auth,
      'supplier',
      'Only suppliers can prepare shipment auctions',
    )
    const orderRef = String(orderId || '').trim()
    const order = await prisma.order.findFirst({
      where: this.orderLookup(orderRef, supplierId),
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
        project: { select: { projectName: true, location: true } },
        orderLineItems: {
          take: 1,
          include: { product: { select: { id: true, title: true, sku: true, weightKg: true } } },
        },
      },
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')
    const { pickupLocation, deliveryLocation } = pickLocations(order)
    return {
      status: 200,
      body: {
        order: {
          id: order.orderNumber,
          dbId: order.id,
          orderNumber: order.orderNumber,
          shippingCharge: money(order.shippingFee),
          pickupLocation,
          deliveryLocation,
          customer: {
            id: order.customer?.id || null,
            name: companyDisplayName(order.customer) || partyName(order.customer),
            email: order.customer?.email || null,
            phone: order.customer?.phoneNumber || null,
          },
          product: order.orderLineItems?.[0]?.product || null,
        },
        message: 'Auction create info fetched',
      },
    }
  }

  async listForSupplier(auth, mode, query) {
    const supplierId = assertRole(auth, 'supplier', 'Only suppliers can list auctions')
    const { page, limit, skip, take } = parsePagination(query, { defaultLimit: 20 })
    const statusFilter = mode === 'active' ? 'PENDING_BIDS' : 'ASSIGNED'

    const where = {
      auctionStatus: statusFilter,
      shipment: { order: { sellerId: supplierId } },
    }

    const rows = await prisma.shipmentAuction.findMany({
      where,
      include: {
        shipment: {
          include: {
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
                checkoutSession: { select: { firstName: true, lastName: true } },
                shippingAddress: true,
                project: { select: { projectName: true, location: true } },
                orderLineItems: {
                  take: 1,
                  include: { product: { select: { title: true } } },
                },
              },
            },
          },
        },
        _count: { select: { bids: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    })

    await Promise.all(rows.map((r) => this.finalizeAuctionIfExpired(r.id)))

    const [total, refreshed] = await Promise.all([
      prisma.shipmentAuction.count({ where }),
      prisma.shipmentAuction.findMany({
        where,
        include: {
          shipment: {
            include: {
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
                  checkoutSession: { select: { firstName: true, lastName: true } },
                  shippingAddress: true,
                  project: { select: { projectName: true, location: true } },
                  orderLineItems: {
                    take: 1,
                    include: { product: { select: { title: true } } },
                  },
                },
              },
            },
          },
          _count: { select: { bids: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ])

    return {
      status: 200,
      body: {
        auctions: refreshed.map(mapAuctionCard),
        pagination: paginationMeta({ page, limit, total }),
        message:
          mode === 'active' ? 'Active auctions fetched' : 'Assigned auctions fetched',
      },
    }
  }

  async getForSupplier(auth, auctionId, mode) {
    const supplierId = assertRole(auth, 'supplier', 'Only suppliers can view auctions')
    await this.finalizeAuctionIfExpired(auctionId)

    const statusFilter = mode === 'active' ? 'PENDING_BIDS' : 'ASSIGNED'
    const auction = await prisma.shipmentAuction.findFirst({
      where: {
        id: auctionId,
        auctionStatus: statusFilter,
        shipment: { order: { sellerId: supplierId } },
      },
      include: {
        shipment: {
          include: {
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
                    unloadingLocationDescription: true,
                    accessConditions: true,
                    additionalNotes: true,
                  },
                },
                orderLineItems: {
                  take: 1,
                  include: {
                    product: { select: { title: true, sku: true, weightKg: true } },
                  },
                },
              },
            },
          },
        },
        bids: {
          orderBy: [{ bidAmount: 'asc' }, { createdAt: 'asc' }],
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
      },
    })

    if (!auction) throw httpError('Auction not found', 404, 'NotFound')

    return {
      status: 200,
      body: {
        auction: mapAuctionDetails(auction),
        message: 'Auction details fetched',
      },
    }
  }

  async listForTransporter(auth, query) {
    const transporterId = assertRole(
      auth,
      'transporter',
      'Only transporters can list auctions',
    )

    const { page, limit, skip, take } = parsePagination(query, { defaultLimit: 20 })
    const filter = this.normalizeTransporterAuctionFilter(query.filter)
    const now = new Date()
    const lingerMs = env.auctionEndedVisibleMinutes * 60 * 1000
    const lingerFrom = new Date(now.getTime() - lingerMs)

    const expiredOpen = await prisma.shipmentAuction.findMany({
      where: { auctionStatus: 'PENDING_BIDS', expiresAt: { lte: now } },
      select: { id: true },
      take: 100,
    })
    await Promise.all(expiredOpen.map((r) => this.finalizeAuctionIfExpired(r.id)))

    const where = this.transporterAuctionBoardWhere(filter, now, lingerFrom)
    const orderBy = this.transporterAuctionBoardOrder(filter)

    const [total, auctions] = await Promise.all([
      prisma.shipmentAuction.count({ where }),
      prisma.shipmentAuction.findMany({
        where,
        include: {
          shipment: {
            select: {
              pickupAddressText: true,
              deliveryAddressText: true,
              distanceKm: true,
              order: {
                select: {
                  shippingFee: true,
                  shippingAddress: true,
                  project: { select: { projectName: true, location: true } },
                  orderLineItems: {
                    take: 1,
                    select: {
                      quantity: true,
                      product: {
                        select: {
                          title: true,
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
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              transporterId: true,
              bidAmount: true,
              createdAt: true,
            },
          },
        },
        orderBy,
        skip,
        take,
      }),
    ])

    return {
      status: 200,
      body: {
        auctions: auctions.map((row) =>
          mapTransporterAuctionCard(row, transporterId),
        ),
        pagination: paginationMeta({ page, limit, total }),
        filter,
        message: 'Auctions fetched',
      },
    }
  }

  normalizeTransporterAuctionFilter(raw) {
    const s = String(raw || 'all')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
    if (s === 'ending_soon' || s === 'endingsoon') return 'ending_soon'
    if (s === 'nearest' || s === 'nearest_first' || s === 'nearestfirst') {
      return 'nearest'
    }
    if (s === 'ended') return 'ended'
    return 'all'
  }

  transporterAuctionBoardWhere(filter, now, lingerFrom) {
    const open = {
      auctionStatus: 'PENDING_BIDS',
      expiresAt: { gt: now },
    }
    const recentlyEnded = {
      auctionStatus: { in: ['ASSIGNED', 'EXPIRED'] },
      expiresAt: { gte: lingerFrom, lte: now },
    }
    if (filter === 'ended') return recentlyEnded
    if (filter === 'ending_soon' || filter === 'nearest') return open
    return { OR: [open, recentlyEnded] }
  }

  transporterAuctionBoardOrder(filter) {
    if (filter === 'ending_soon') return { expiresAt: 'asc' }
    if (filter === 'nearest') return { shipment: { distanceKm: 'asc' } }
    if (filter === 'ended') return { expiresAt: 'desc' }
    return { createdAt: 'desc' }
  }

  async getForTransporter(auth, auctionId) {
    const transporterId = assertRole(
      auth,
      'transporter',
      'Only transporters can view auctions',
    )
    await this.finalizeAuctionIfExpired(auctionId)

    const auction = await prisma.shipmentAuction.findFirst({
      where: { id: auctionId },
      include: {
        shipment: {
          include: {
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
                    unloadingLocationDescription: true,
                    accessConditions: true,
                    additionalNotes: true,
                  },
                },
                orderLineItems: {
                  take: 1,
                  include: {
                    product: { select: { title: true, sku: true, weightKg: true } },
                  },
                },
              },
            },
          },
        },
        bids: {
          orderBy: [{ bidAmount: 'asc' }, { createdAt: 'asc' }],
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
      },
    })
    if (!auction) throw httpError('Auction not found', 404, 'NotFound')

    const acceptedBid = auction.bids.find((b) => b.status === 'ACCEPTED')
    const isAssignedToMe =
      auction.auctionStatus === 'ASSIGNED' &&
      acceptedBid?.transporterId === transporterId

    if (!isAssignedToMe) {
      throw httpError(
        'Auction details are available only after you are assigned',
        403,
        'NotAssigned',
      )
    }

    return {
      status: 200,
      body: {
        auction: mapAuctionDetails(auction),
        message: 'Auction details fetched',
      },
    }
  }

  async bidForTransporter(auth, auctionId, body) {
    const transporterId = assertRole(
      auth,
      'transporter',
      'Only transporters can bid on auctions',
    )
    await this.finalizeAuctionIfExpired(auctionId)

    const auction = await prisma.shipmentAuction.findFirst({
      where: { id: auctionId, auctionStatus: 'PENDING_BIDS' },
      select: {
        id: true,
        expiresAt: true,
        shipment: { select: { order: { select: { shippingFee: true } } } },
      },
    })
    if (!auction) throw httpError('Auction not found or no longer active', 404, 'NotFound')
    if (auction.expiresAt <= new Date()) {
      throw httpError('Auction bidding time already ended', 400, 'AuctionExpired')
    }

    const shippingCharge = Number(auction.shipment.order.shippingFee || 0)
    if (!(Number(body.bidAmount) < shippingCharge)) {
      throw httpError(
        'Bid amount must be lower than shipping charge',
        400,
        'BidTooHigh',
      )
    }

    const bid = await prisma.transporterBid.upsert({
      where: { auctionId_transporterId: { auctionId, transporterId } },
      update: {
        bidAmount: Number(body.bidAmount),
        status: 'SUBMITTED',
      },
      create: {
        auctionId,
        transporterId,
        bidAmount: Number(body.bidAmount),
        estimatedDeliveryTime: '',
      },
      select: { id: true },
    })

    return {
      status: 201,
      body: {
        id: bid.id,
        message: 'Bid submitted',
      },
    }
  }
}

export default new AuctionService()
