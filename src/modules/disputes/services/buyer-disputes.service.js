import prisma from '../../../../lib/prisma.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { companyDisplayName } from '../../../shared/party.js'
import { httpError, notFound } from '../../../shared/errors.js'
import {
  createBuyerDispute,
  getDispute,
  listBuyerDisputes,
} from '../data/disputes.store.js'

const LINE_ITEM_SELECT = {
  id: true,
  product: {
    select: {
      title: true,
      media: {
        orderBy: [{ isBanner: 'desc' }, { sortOrder: 'asc' }],
        take: 1,
        select: { mediaUrl: true },
      },
    },
  },
}

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  seller: {
    select: {
      name: true,
      profile: { select: { companyName: true } },
    },
  },
  orderLineItems: { select: LINE_ITEM_SELECT },
}

function mapLineItem(row, baseUrl, orderNumber) {
  const mediaUrl = row.product?.media?.[0]?.mediaUrl || null
  return {
    id: row.id,
    productName: row.product?.title || null,
    orderId: orderNumber,
    image: mediaUrl ? absolutizeUrl(mediaUrl, baseUrl) : null,
  }
}

function mapOrder(row, baseUrl) {
  const items = (row.orderLineItems || []).map((line) =>
    mapLineItem(line, baseUrl, row.orderNumber),
  )
  const first = items[0]
  return {
    orderNumber: row.orderNumber,
    productName: first?.productName || null,
    image: first?.image || null,
    seller: companyDisplayName(row.seller),
    items,
  }
}

function pickItems(order, itemIds) {
  const wanted = (itemIds || []).map((id) => String(id).trim()).filter(Boolean)
  if (!wanted.length) return order.items
  const allowed = new Set(order.items.map((item) => item.id))
  const unknown = wanted.filter((id) => !allowed.has(id))
  if (unknown.length) {
    throw httpError('One or more items do not belong to this order', 400, 'ValidationError')
  }
  return order.items.filter((item) => wanted.includes(item.id))
}

function orderRef(body) {
  return String(body.orderNumber || body.orderId || '').trim()
}

export class BuyerDisputesService {
  async listOrders(auth, baseUrl) {
    const orders = await prisma.order.findMany({
      where: { customerId: auth.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: ORDER_SELECT,
    })

    return {
      status: 200,
      body: { orders: orders.map((row) => mapOrder(row, baseUrl)) },
    }
  }

  async list() {
    return { status: 200, body: listBuyerDisputes() }
  }

  async getById(disputeId) {
    return { status: 200, body: getDispute(disputeId) }
  }

  async create(auth, body, baseUrl) {
    const ref = orderRef(body)
    const row = await prisma.order.findFirst({
      where: {
        customerId: auth.id,
        OR: [{ orderNumber: ref }, { id: ref }],
      },
      select: ORDER_SELECT,
    })
    if (!row) throw notFound('Order not found')

    const order = mapOrder(row, baseUrl)
    const items = pickItems(order, body.itemIds)
    if (!items.length) throw notFound('Order item not found')

    return {
      status: 201,
      body: createBuyerDispute(auth, body, { ...order, items }),
    }
  }
}

export default new BuyerDisputesService()
