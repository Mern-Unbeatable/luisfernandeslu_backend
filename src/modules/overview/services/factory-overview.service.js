/**
 * Factory dashboard overview (UI: Dashboard Overview).
 * GET /api/factory/dashboard
 */
import prisma from '../../../../lib/prisma.js'
import { money } from '../../../shared/money.js'
import { httpError } from '../../../shared/errors.js'
import { commissionPercentOf } from '../../payments/eupago.client.js'
import { FACTORY_ORDER_SOURCE } from '../../orders/factory-status-rules.js'

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const COMPLETED = ['COMPLETED', 'DELIVERED']
const IN_PRODUCTION = ['IN_PRODUCTION', 'PRODUCED', 'READY']
const PENDING = ['NEW', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT']

const STATUS_COLORS = {
  completed: '#DF900A',
  inProduction: '#E85A8C',
  pending: '#84CC16',
}

function assertFactory(auth) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'factory') {
    throw httpError('Only factories can view dashboard', 403, 'Forbidden')
  }
  return auth.id
}

function factoryOrderWhere(factoryId, extra = {}) {
  return {
    sellerId: factoryId,
    orderSource: FACTORY_ORDER_SOURCE,
    orderStatus: { not: 'CANCELLED' },
    ...extra,
  }
}

function yearRange(year) {
  return {
    gte: new Date(year, 0, 1),
    lt: new Date(year + 1, 0, 1),
  }
}

function monthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { gte: start, lt: end }
}

function weekRange(now = new Date()) {
  const start = new Date(now)
  const day = start.getDay()
  const diff = day === 0 ? 6 : day - 1
  start.setDate(start.getDate() - diff)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { gte: start, lt: end }
}

function emptyYearPoints() {
  return MONTHS.map((month) => ({ month, value: 0 }))
}

function bucketYear(rows) {
  const points = emptyYearPoints()
  for (const row of rows) {
    const idx = new Date(row.createdAt).getMonth()
    points[idx].value = money(points[idx].value + Number(row.grandTotal || 0))
  }
  return points
}

function niceMax(n) {
  const value = Number(n) || 0
  if (value <= 0) return 1000
  const mag = 10 ** Math.floor(Math.log10(value))
  const norm = value / mag
  let nice = 10
  if (norm <= 1) nice = 1
  else if (norm <= 2) nice = 2
  else if (norm <= 2.5) nice = 2.5
  else if (norm <= 5) nice = 5
  const top = nice * mag
  return top < value ? top * 1.25 : top
}

function axisFor(points) {
  const peak = Math.max(0, ...points.map((p) => Number(p.value) || 0))
  const maxValue = niceMax(peak)
  const step = money(maxValue / 4)
  return {
    maxValue,
    yTicks: [0, step, money(step * 2), money(step * 3), maxValue],
  }
}

async function countByBuckets(factoryId, createdAt) {
  const base = factoryOrderWhere(factoryId, createdAt ? { createdAt } : {})
  const [completed, inProduction, pending] = await Promise.all([
    prisma.order.count({
      where: { ...base, orderStatus: { in: COMPLETED } },
    }),
    prisma.order.count({
      where: { ...base, orderStatus: { in: IN_PRODUCTION } },
    }),
    prisma.order.count({
      where: { ...base, orderStatus: { in: PENDING } },
    }),
  ])
  return { completed, inProduction, pending }
}

function statusSeries(counts) {
  return [
    {
      key: 'completed',
      value: counts.completed,
      color: STATUS_COLORS.completed,
    },
    {
      key: 'inProduction',
      value: counts.inProduction,
      color: STATUS_COLORS.inProduction,
    },
    {
      key: 'pending',
      value: counts.pending,
      color: STATUS_COLORS.pending,
    },
  ]
}

function revenueBlock(year, points) {
  const axis = axisFor(points)
  return {
    year,
    months: points,
    /** Flat 12 values for FE line chart (Jan→Dec). */
    values: points.map((p) => p.value),
    maxValue: axis.maxValue,
    yTicks: axis.yTicks,
  }
}

export class FactoryOverviewService {
  async get(auth) {
    const factoryId = assertFactory(auth)
    const now = new Date()
    const year = now.getFullYear()
    const factoryUser = await prisma.user.findUnique({
      where: { id: factoryId },
      select: { vatRate: true },
    })
    const commissionPercent = commissionPercentOf(factoryUser)

    const [
      totalOrders,
      completedOrders,
      pendingOrders,
      revenueAgg,
      yearRows,
      statusThisMonth,
      statusThisWeek,
    ] = await Promise.all([
      prisma.order.count({ where: factoryOrderWhere(factoryId) }),
      prisma.order.count({
        where: factoryOrderWhere(factoryId, {
          orderStatus: { in: COMPLETED },
        }),
      }),
      prisma.order.count({
        where: factoryOrderWhere(factoryId, {
          orderStatus: { in: [...IN_PRODUCTION, ...PENDING] },
        }),
      }),
      prisma.order.aggregate({
        where: factoryOrderWhere(factoryId),
        _sum: { grandTotal: true },
      }),
      prisma.order.findMany({
        where: factoryOrderWhere(factoryId, {
          createdAt: yearRange(year),
        }),
        select: { createdAt: true, grandTotal: true },
      }),
      countByBuckets(factoryId, monthRange(now)),
      countByBuckets(factoryId, weekRange(now)),
    ])

    return {
      status: 200,
      body: {
        message: 'Factory dashboard fetched',
        stats: {
          totalOrders,
          pendingOrders,
          completedOrders,
          totalRevenue: money(revenueAgg._sum.grandTotal),
          adminCommissionPercent: commissionPercent,
          adminCommissionLabel: `${commissionPercent}% per order`,
        },
        revenue: revenueBlock(year, bucketYear(yearRows)),
        orderStatus: {
          thisMonth: statusSeries(statusThisMonth),
          thisWeek: statusSeries(statusThisWeek),
        },
      },
    }
  }
}

export default new FactoryOverviewService()
