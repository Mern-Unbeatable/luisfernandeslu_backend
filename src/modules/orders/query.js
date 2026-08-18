import prisma from '../../../lib/prisma.js'
import { money } from '../../shared/money.js'
import { parsePagination, paginationMeta } from '../../shared/pagination.js'
import { normalizeStatusFilter } from './status.js'

export function sellerBuyerWhere(sellerId, buyerRole) {
  return {
    sellerId,
    customer: { role: buyerRole },
  }
}

export function buildListWhere(base, query, { searchCompanyName = false } = {}) {
  const search = String(query.search || '').trim()
  const statusFilter = normalizeStatusFilter(query.status)
  const companyId = String(query.companyId || '').trim()

  const where = {
    ...base,
    ...(statusFilter ? { orderStatus: statusFilter } : {}),
    ...(companyId ? { customerId: companyId } : {}),
  }

  if (search) {
    const or = [
      { orderNumber: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
      { customer: { email: { contains: search, mode: 'insensitive' } } },
    ]
    if (searchCompanyName) {
      or.push({
        customer: {
          profile: { companyName: { contains: search, mode: 'insensitive' } },
        },
      })
    }
    const statusFromSearch = normalizeStatusFilter(search)
    if (statusFromSearch) or.push({ orderStatus: statusFromSearch })
    where.AND = [{ OR: or }]
  }

  return where
}

export async function countSimpleStats(base) {
  const [totalOrders, pending, processing, completed] = await Promise.all([
    prisma.order.count({ where: base }),
    prisma.order.count({ where: { ...base, orderStatus: 'PENDING' } }),
    prisma.order.count({ where: { ...base, orderStatus: 'PROCESSING' } }),
    prisma.order.count({
      where: { ...base, orderStatus: { in: ['COMPLETED', 'DELIVERED'] } },
    }),
  ])
  return { totalOrders, pending, processing, completed }
}

export async function paginateOrders({ where, query, select, mapRow, message }) {
  const { page, limit, skip } = parsePagination(query)
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select,
    }),
  ])

  return {
    status: 200,
    body: {
      orders: rows.map(mapRow),
      pagination: paginationMeta({ page, limit, total }),
      message,
    },
  }
}

export function mapQuantityRow(o, extra = {}) {
  const itemCount = o.orderLineItems?.length || 0
  const totalQuantity = (o.orderLineItems || []).reduce(
    (s, li) => s + Number(li.quantity || 0),
    0,
  )
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    orderId: o.orderNumber,
    items: itemCount,
    totalQuantity,
    total: money(o.grandTotal),
    orderStatus: o.orderStatus,
    date: o.createdAt,
    ...extra,
  }
}

export const listSelectWithItems = {
  id: true,
  orderNumber: true,
  orderStatus: true,
  grandTotal: true,
  createdAt: true,
  customerId: true,
  customer: {
    select: {
      id: true,
      name: true,
      email: true,
      profile: { select: { companyName: true } },
    },
  },
  orderLineItems: { select: { id: true, quantity: true } },
}
