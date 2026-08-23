import prisma from '../../../../lib/prisma.js'
import { money } from '../../../shared/money.js'
import { companyDisplayName, partyName } from '../../../shared/party.js'
import { parsePagination, paginationMeta } from '../../../shared/pagination.js'
import { assertSupplier } from '../../orders/status.js'

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

const CUSTOMER_COLOR = '#7C3AED'
const COMPANY_COLOR = '#10B981'

const CANCELLED = 'CANCELLED'
const ACTIVE_STATUSES = [
  'NEW',
  'PENDING',
  'PROCESSING',
  'IN_PRODUCTION',
  'PRODUCED',
  'READY',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
]

function sellerWhere(sellerId) {
  return { sellerId }
}

function yearRange(year) {
  return {
    gte: new Date(year, 0, 1),
    lt: new Date(year + 1, 0, 1),
  }
}

function dashboardStatus(orderStatus) {
  if (orderStatus === 'CANCELLED') return 'cancel'
  if (orderStatus === 'COMPLETED' || orderStatus === 'DELIVERED') return 'completed'
  if (
    orderStatus === 'ASSIGNED' ||
    orderStatus === 'PICKED_UP' ||
    orderStatus === 'IN_TRANSIT'
  ) {
    return 'assign'
  }
  return 'pending'
}

function paymentLabel(order) {
  const installments = order.paymentPlan?.installments || []
  const hasOpen = installments.some(
    (row) => row.status === 'PENDING' || row.status === 'OVERDUE',
  )
  if (hasOpen) return 'Installment Active'
  if (order.checkoutSession?.paymentStatus === 'PAID') return 'Paid'
  if (installments.length) return 'Installment Active'
  return 'Paid'
}

function orderType(role) {
  return String(role).toUpperCase() === 'COMPANY' ? 'Company' : 'Regular'
}

function companyTab(order) {
  if (String(order.customer?.role).toUpperCase() !== 'COMPANY') return undefined
  return order.orderSource === 'QUOTE_CONVERSION' ? 'chat' : 'direct'
}

function emptyYear() {
  return MONTHS.map((month) => ({ month, value: 0 }))
}

function bucketYear(rows) {
  const customer = emptyYear()
  const company = emptyYear()
  for (const row of rows) {
    const idx = new Date(row.createdAt).getMonth()
    const amount = money(row.grandTotal)
    if (String(row.customer?.role).toUpperCase() === 'COMPANY') {
      company[idx].value = money(company[idx].value + amount)
    } else {
      customer[idx].value = money(customer[idx].value + amount)
    }
  }
  return { customer, company }
}

function niceMax(n) {
  const value = Number(n) || 0
  if (value <= 0) return 10000
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

function axisFor(seriesList) {
  const peak = Math.max(
    0,
    ...seriesList.flatMap((s) => s.points.map((p) => Number(p.value) || 0)),
  )
  const maxValue = niceMax(peak)
  const step = money(maxValue / 4)
  return {
    maxValue,
    yTicks: [0, step, money(step * 2), money(step * 3), maxValue],
  }
}

function seriesPayload(buckets) {
  return [
    { id: 'customer', color: CUSTOMER_COLOR, points: buckets.customer },
    { id: 'company', color: COMPANY_COLOR, points: buckets.company },
  ]
}

function mapOrder(order) {
  const type = orderType(order.customer?.role)
  const row = {
    id: order.id,
    orderId: order.orderNumber,
    customerName:
      type === 'Company'
        ? companyDisplayName(order.customer) || partyName(order.customer)
        : order.customer?.name || partyName(order.customer),
    type,
    price: money(order.grandTotal),
    payment: paymentLabel(order),
    status: dashboardStatus(order.orderStatus),
  }
  const tab = companyTab(order)
  if (tab) row.tab = tab
  return row
}

export class SupplierOverviewService {
  async get(auth, query = {}) {
    const sellerId = assertSupplier(auth, 'Only suppliers can view overview')
    const year = Number(query.period) || new Date().getFullYear()
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 7,
    })
    const base = sellerWhere(sellerId)
    const createdAt = yearRange(year)

    const [
      totalSalesRegular,
      totalSalesCompany,
      activeOrders,
      cancelOrders,
      totalProducts,
      yearRows,
      total,
      orders,
    ] = await Promise.all([
      prisma.order.aggregate({
        where: {
          ...base,
          orderStatus: { not: CANCELLED },
          customer: { role: 'CUSTOMER' },
        },
        _sum: { grandTotal: true },
      }),
      prisma.order.aggregate({
        where: {
          ...base,
          orderStatus: { not: CANCELLED },
          customer: { role: 'COMPANY' },
        },
        _sum: { grandTotal: true },
      }),
      prisma.order.count({
        where: { ...base, orderStatus: { in: ACTIVE_STATUSES } },
      }),
      prisma.order.count({
        where: { ...base, orderStatus: CANCELLED },
      }),
      prisma.product.count({ where: { sellerId } }),
      prisma.order.findMany({
        where: {
          ...base,
          orderStatus: { not: CANCELLED },
          createdAt,
        },
        select: {
          createdAt: true,
          grandTotal: true,
          customer: { select: { role: true } },
        },
      }),
      prisma.order.count({ where: base }),
      prisma.order.findMany({
        where: base,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          orderSource: true,
          grandTotal: true,
          customer: {
            select: {
              name: true,
              role: true,
              profile: { select: { companyName: true } },
            },
          },
          checkoutSession: { select: { paymentStatus: true } },
          paymentPlan: {
            select: {
              installments: { select: { status: true } },
            },
          },
        },
      }),
    ])

    const series = seriesPayload(bucketYear(yearRows))
    const axis = axisFor(series)

    return {
      status: 200,
      body: {
        stats: {
          totalSalesRegular: money(totalSalesRegular._sum.grandTotal),
          totalSalesCompany: money(totalSalesCompany._sum.grandTotal),
          activeOrders,
          cancelOrders,
          totalProducts,
        },
        revenue: {
          year,
          maxValue: axis.maxValue,
          yTicks: axis.yTicks,
          series,
        },
        orders: orders.map(mapOrder),
        pagination: paginationMeta({ page, limit, total }),
      },
    }
  }
}

export default new SupplierOverviewService()
