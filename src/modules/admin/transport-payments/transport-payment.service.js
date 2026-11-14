import prisma from '../../../../lib/prisma.js'
import { money } from '../../../shared/money.js'
import { parsePagination, paginationMeta } from '../../../shared/pagination.js'
import { companyDisplayName, partyName } from '../../../shared/party.js'

const STATUS_FILTER = {
  pending: 'PENDING_PAYMENT',
  paid: 'PAID',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
}

const STATUS_LABEL = {
  PENDING_PAYMENT: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
}

const partySelect = {
  select: {
    name: true,
    email: true,
    profile: { select: { companyName: true } },
  },
}

const acceptedBid = { status: 'ACCEPTED' }

function partyLabel(user) {
  return companyDisplayName(user) || partyName(user) || user?.email || ''
}

function mapRow(row) {
  const auction = row.order?.shipment?.auction || null
  const winner = auction?.bids?.[0] || null
  const amount = money(row.amount)
  const transporterCost = winner ? money(winner.bidAmount) : null
  return {
    id: row.id,
    paymentNumber: row.paymentNumber,
    orderId: row.orderId,
    orderNumber: row.order?.orderNumber || '',
    factory: partyLabel(row.order?.seller),
    supplier: partyLabel(row.order?.customer),
    vehicleType: row.requiredVehicleType,
    distanceKm: Math.round((row.distanceKm || 0) * 10) / 10,
    amount,
    status: STATUS_LABEL[row.status] || 'pending',
    paymentMethod: row.paymentMethod ? String(row.paymentMethod).toLowerCase() : null,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    auction: auction
      ? {
          code: auction.auctionCode,
          status: String(auction.auctionStatus).toLowerCase(),
          bids: auction._count?.bids || 0,
          winner: winner ? partyLabel(winner.transporter) : null,
        }
      : null,
    transporterCost,
    margin: transporterCost == null ? null : money(amount - transporterCost),
  }
}

class AdminTransportPaymentService {
  async list(query = {}) {
    const { page, limit, skip, take } = parsePagination(query, { defaultLimit: 10, maxLimit: 100 })
    const where = {}
    const status = STATUS_FILTER[String(query.status || '').toLowerCase()]
    if (status) where.status = status
    const term = String(query.search || '').trim()
    if (term) {
      where.OR = [
        { paymentNumber: { contains: term, mode: 'insensitive' } },
        { order: { orderNumber: { contains: term, mode: 'insensitive' } } },
        { order: { seller: { name: { contains: term, mode: 'insensitive' } } } },
        { order: { customer: { name: { contains: term, mode: 'insensitive' } } } },
        { order: { seller: { profile: { companyName: { contains: term, mode: 'insensitive' } } } } },
        { order: { customer: { profile: { companyName: { contains: term, mode: 'insensitive' } } } } },
      ]
    }

    const assignedPaid = {
      status: 'PAID',
      order: { shipment: { auction: { bids: { some: acceptedBid } } } },
    }

    const [total, rows, paidAgg, pendingAgg, failedCount, assignedAgg, costAgg] =
      await Promise.all([
        prisma.transportPayment.count({ where }),
        prisma.transportPayment.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: {
            order: {
              select: {
                orderNumber: true,
                seller: partySelect,
                customer: partySelect,
                shipment: {
                  select: {
                    auction: {
                      select: {
                        auctionCode: true,
                        auctionStatus: true,
                        _count: { select: { bids: true } },
                        bids: {
                          where: acceptedBid,
                          take: 1,
                          select: { bidAmount: true, transporter: partySelect },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        prisma.transportPayment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
        prisma.transportPayment.aggregate({
          where: { status: 'PENDING_PAYMENT' },
          _sum: { amount: true },
        }),
        prisma.transportPayment.count({ where: { status: 'FAILED' } }),
        prisma.transportPayment.aggregate({ where: assignedPaid, _sum: { amount: true } }),
        prisma.transporterBid.aggregate({
          where: {
            ...acceptedBid,
            auction: { shipment: { order: { transportPayment: { status: 'PAID' } } } },
          },
          _sum: { bidAmount: true },
        }),
      ])

    const transporterCost = money(costAgg._sum.bidAmount || 0)
    const assignedPaidTotal = money(assignedAgg._sum.amount || 0)
    return {
      status: 200,
      body: {
        payments: rows.map(mapRow),
        summary: {
          paidTotal: money(paidAgg._sum.amount || 0),
          pendingTotal: money(pendingAgg._sum.amount || 0),
          failedCount,
          assignedPaidTotal,
          transporterCost,
          margin: money(assignedPaidTotal - transporterCost),
        },
        pagination: paginationMeta({ page, limit, total }),
        message: 'Transport payments fetched',
      },
    }
  }
}

export default new AdminTransportPaymentService()
