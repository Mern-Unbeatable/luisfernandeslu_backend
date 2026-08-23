import prisma from '../../../lib/prisma.js'
import { env } from '../../config/env.js'
import { money } from '../../shared/money.js'
import { companyDisplayName, partyName } from '../../shared/party.js'
import { parsePagination, paginationMeta } from '../../shared/pagination.js'
import { httpError, notFound } from '../../shared/errors.js'
import { buildCommissionInvoicePdf } from '../../shared/pdf/commission-invoice-pdf.js'
import { getCommissionPercent } from '../payments/eupago.client.js'

const ROLE_MAP = {
  supplier: 'SUPPLIER',
  factory: 'FACTORY',
  transporter: 'TRANSPORTER',
}

const PARTY_SELECT = {
  id: true,
  name: true,
  role: true,
  vatRate: true,
  profile: { select: { companyName: true } },
}

function prismaRole(role) {
  const mapped = ROLE_MAP[String(role || '').toLowerCase()]
  if (!mapped) throw httpError('Invalid party role', 400, 'ValidationError')
  return mapped
}

export function toInvoiceId(orderNumber) {
  return `CI-${String(orderNumber || '').replace(/^ORD-?/i, '')}`
}

function orderRefFromInvoiceId(invoiceId) {
  const raw = String(invoiceId || '').trim()
  if (/^CI-/i.test(raw)) return `ORD-${raw.slice(3)}`
  return raw
}

function sellerWhere(partyId) {
  return {
    sellerId: partyId,
    orderStatus: { not: 'CANCELLED' },
  }
}

function transporterWhere(partyId) {
  return {
    orderStatus: { not: 'CANCELLED' },
    shipment: {
      auction: {
        bids: { some: { transporterId: partyId, status: 'ACCEPTED' } },
      },
    },
  }
}

function orderWhere(role, partyId, search) {
  const base =
    role === 'TRANSPORTER' ? transporterWhere(partyId) : sellerWhere(partyId)
  const term = String(search || '').trim()
  if (!term) return base
  const fromCode = /^CI-/i.test(term) ? orderRefFromInvoiceId(term) : null
  return {
    ...base,
    AND: [
      {
        OR: [
          { id: term },
          { orderNumber: { contains: term, mode: 'insensitive' } },
          ...(fromCode ? [{ orderNumber: fromCode }] : []),
          { customer: { name: { contains: term, mode: 'insensitive' } } },
          {
            customer: {
              profile: { companyName: { contains: term, mode: 'insensitive' } },
            },
          },
        ],
      },
    ],
  }
}

function orderSelect(partyId) {
  return {
    id: true,
    orderNumber: true,
    grandTotal: true,
    createdAt: true,
    customer: {
      select: {
        name: true,
        profile: { select: { companyName: true } },
      },
    },
    shipment: {
      select: {
        auction: {
          select: {
            bids: {
              where: { status: 'ACCEPTED', transporterId: partyId },
              take: 1,
              select: { bidAmount: true, transporterId: true },
            },
          },
        },
      },
    },
  }
}

function baseAmount(order, role, partyId) {
  if (role === 'TRANSPORTER') {
    const bid = (order.shipment?.auction?.bids || []).find(
      (row) => row.transporterId === partyId,
    ) || order.shipment?.auction?.bids?.[0]
    return money(bid?.bidAmount)
  }
  return money(order.grandTotal)
}

function commissionPercentOf(party) {
  const custom = Number(party.vatRate)
  if (Number.isFinite(custom) && custom > 0) return money(custom)
  return money(getCommissionPercent())
}

function mapRow(order, party, role) {
  const percent = commissionPercentOf(party)
  const orderTotal = baseAmount(order, role, party.id)
  const amount = money((orderTotal * percent) / 100)
  const date = order.createdAt.toISOString().slice(0, 10)
  return {
    id: toInvoiceId(order.orderNumber),
    type: 'Invoice',
    orderId: order.orderNumber,
    customer: companyDisplayName(order.customer) || partyName(order.customer),
    amount,
    date,
    orderTotal,
    commissionPercent: percent,
    partyPayout: money(orderTotal - amount),
    partyName: companyDisplayName(party) || partyName(party),
    role: String(role).toLowerCase(),
    currency: env.currency,
  }
}

function toListItem(row) {
  return {
    id: row.id,
    type: row.type,
    orderId: row.orderId,
    customer: row.customer,
    amount: row.amount,
    date: row.date,
  }
}

function toDetail(row) {
  return {
    id: row.id,
    type: row.type,
    orderId: row.orderId,
    customer: row.customer,
    amount: row.amount,
    date: row.date,
    orderTotal: row.orderTotal,
    commissionPercent: row.commissionPercent,
    partyPayout: row.partyPayout,
  }
}

export class CommissionInvoiceService {
  async loadParty(partyId, role) {
    const prismaRoleName = prismaRole(role)
    const party = await prisma.user.findFirst({
      where: { id: partyId, role: prismaRoleName },
      select: PARTY_SELECT,
    })
    if (!party) throw notFound(`${prismaRoleName.toLowerCase()} not found`)
    return { party, role: prismaRoleName }
  }

  async list(partyId, role, query = {}) {
    const { party, role: prismaRoleName } = await this.loadParty(partyId, role)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 7,
    })
    const where = orderWhere(prismaRoleName, party.id, query.search)
    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: orderSelect(party.id),
      }),
    ])

    return {
      status: 200,
      body: {
        invoices: orders.map((order) =>
          toListItem(mapRow(order, party, prismaRoleName)),
        ),
        pagination: paginationMeta({ page, limit, total }),
      },
    }
  }

  async getMapped(partyId, role, invoiceId) {
    const { party, role: prismaRoleName } = await this.loadParty(partyId, role)
    const ref = orderRefFromInvoiceId(invoiceId)
    const order = await prisma.order.findFirst({
      where: {
        ...orderWhere(prismaRoleName, party.id),
        OR: [
          { id: invoiceId },
          { orderNumber: invoiceId },
          { orderNumber: ref },
        ],
      },
      select: orderSelect(party.id),
    })
    if (!order) throw notFound('Commission invoice not found')
    return mapRow(order, party, prismaRoleName)
  }

  async getById(partyId, role, invoiceId) {
    const row = await this.getMapped(partyId, role, invoiceId)
    return { status: 200, body: toDetail(row) }
  }

  async downloadPdf(partyId, role, invoiceId) {
    const row = await this.getMapped(partyId, role, invoiceId)
    const buffer = await buildCommissionInvoicePdf(row)
    return {
      file: {
        buffer,
        filename: `${row.id}.pdf`,
        contentType: 'application/pdf',
      },
    }
  }
}

export default new CommissionInvoiceService()
