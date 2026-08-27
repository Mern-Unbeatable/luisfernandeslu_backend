/**
 * Transporter dashboard (UI: Dashboard Overview).
 * GET /api/transporter/dashboard?period=thisYear|lastYear|2026
 */
import prisma from '../../../../lib/prisma.js'
import { money } from '../../../shared/money.js'
import { httpError } from '../../../shared/errors.js'
import {
  buildLedger,
  resolveYear,
  niceMax,
  netPayout,
  commissionPercentOf,
} from '../../transporter-payments/services/transporter-payments.service.js'

const ACTIVE_DELIVERY = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT']
const COMPLETED = ['DELIVERED', 'COMPLETED']

function assertTransporter(auth) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'transporter') {
    throw httpError('Only transporters can view dashboard', 403, 'Forbidden')
  }
  return auth.id
}

function dayBounds(now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

function assignedAuctionWhere(transporterId, orderStatus) {
  return {
    auctionStatus: 'ASSIGNED',
    bids: { some: { transporterId, status: 'ACCEPTED' } },
    shipment: { order: { orderStatus } },
  }
}

class TransporterOverviewService {
  async get(auth, query = {}) {
    const transporterId = assertTransporter(auth)
    const periodRaw = query.period ?? 'thisYear'
    const year = resolveYear(periodRaw)
    const period =
      periodRaw === 'lastYear'
        ? 'lastYear'
        : periodRaw === 'thisYear' || periodRaw === '' || periodRaw == null
          ? 'thisYear'
          : String(year)

    const now = new Date()
    const { start: todayStart, end: todayEnd } = dayBounds(now)

    const [
      user,
      activeAuctions,
      wonDeliveries,
      inTransit,
      completedTodayRows,
      ledger,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: transporterId },
        select: { name: true, vatRate: true },
      }),
      prisma.shipmentAuction.count({
        where: {
          auctionStatus: 'PENDING_BIDS',
          expiresAt: { gt: now },
        },
      }),
      prisma.shipmentAuction.count({
        where: assignedAuctionWhere(transporterId, { in: ACTIVE_DELIVERY }),
      }),
      prisma.shipmentAuction.count({
        where: assignedAuctionWhere(transporterId, 'IN_TRANSIT'),
      }),
      prisma.transporterBid.findMany({
        where: {
          transporterId,
          status: 'ACCEPTED',
          auction: {
            auctionStatus: 'ASSIGNED',
            shipment: {
              order: {
                orderStatus: { in: COMPLETED },
                statusHistory: {
                  some: {
                    status: { in: COMPLETED },
                    createdAt: { gte: todayStart, lte: todayEnd },
                  },
                },
              },
            },
          },
        },
        select: { bidAmount: true },
      }),
      buildLedger(transporterId, year),
    ])

    const percent = commissionPercentOf(user?.vatRate)
    const todaysEarnings = money(
      completedTodayRows.reduce(
        (sum, row) => sum + netPayout(row.bidAmount, percent),
        0,
      ),
    )
    const completedToday = completedTodayRows.length

    const peak = Math.max(0, ...ledger.monthly)
    const maxValue = niceMax(peak)
    const step = money(maxValue / 4)

    return {
      status: 200,
      body: {
        welcomeName: user?.name || null,
        stats: {
          activeAuctions,
          wonDeliveries,
          inTransit,
          completedToday,
          todaysEarnings,
          pendingEarnings: ledger.pendingEarnings,
        },
        actions: {
          activeAuctions,
          activeDeliveries: wonDeliveries,
          availablePayout: ledger.availableBalance,
        },
        revenue: {
          period,
          year,
          maxValue,
          yTicks: [0, step, money(step * 2), money(step * 3), maxValue],
          points: ledger.monthly,
        },
        message: 'Dashboard fetched',
      },
    }
  }
}

export default new TransporterOverviewService()
