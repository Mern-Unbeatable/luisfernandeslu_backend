import prisma from '../../../../lib/prisma.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { companyDisplayName } from '../../../shared/party.js'
import { httpError, notFound } from '../../../shared/errors.js'

function normalizeStatus(value) {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'open') return 'pending'
  return v || 'pending'
}

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
  sellerId: true,
  seller: {
    select: {
      id: true,
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
    id: row.id,
    orderNumber: row.orderNumber,
    sellerId: row.sellerId || row.seller?.id,
    productName: first?.productName || null,
    image: first?.image || null,
    seller: companyDisplayName(row.seller),
    items,
  }
}

export class BuyerDisputesService {
  async listOrders(auth, baseUrl) {
    if (!auth?.id) {
      return { status: 200, body: { orders: [] } }
    }

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

  async list(auth, baseUrl) {
    if (!auth?.id) {
      return {
        status: 200,
        body: {
          disputes: [],
          stats: { total: 0, pendingReview: 0, approved: 0, rejected: 0 },
        },
      }
    }

    const list = await prisma.dispute.findMany({
      where: {
        accuserUserId: auth.id,
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            seller: { select: { id: true, name: true } },
          },
        },
        accused: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const mapped = list.map((d) => {
      const statusLower = normalizeStatus(d.status)
      return {
        id: d.id,
        disputeId: d.id,
        orderId: d.order?.orderNumber || d.order?.id || '',
        customer: auth.name || 'Eu',
        supplier: d.accused?.name || d.order?.seller?.name || 'Fornecedor',
        issue: d.issueReason || 'Disputa de encomenda',
        status: statusLower,
        registered: d.createdAt ? d.createdAt.toISOString().slice(0, 10) : '',
      }
    })

    const stats = {
      total: mapped.length,
      pendingReview: mapped.filter((d) =>
        ['pending', 'under_review'].includes(d.status),
      ).length,
      approved: mapped.filter((d) => d.status === 'resolved').length,
      rejected: mapped.filter((d) => d.status === 'rejected').length,
    }

    return {
      status: 200,
      body: {
        disputes: mapped,
        stats,
      },
    }
  }

  async getById(disputeId, auth, baseUrl) {
    const authId = auth?.id
    const d = await prisma.dispute.findFirst({
      where: {
        id: disputeId,
        ...(authId
          ? {
              OR: [{ accuserUserId: authId }, { accusedUserId: authId }],
            }
          : {}),
      },
      include: {
        order: {
          include: {
            orderLineItems: {
              include: {
                product: {
                  select: {
                    id: true,
                    title: true,
                    media: { take: 1, select: { mediaUrl: true } },
                  },
                },
              },
            },
            seller: { select: { id: true, name: true } },
          },
        },
        accuser: {
          select: { id: true, name: true, email: true, phoneNumber: true },
        },
        accused: { select: { id: true, name: true, email: true } },
        messages: {
          include: {
            sender: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        evidences: true,
      },
    })

    if (!d) throw notFound('Dispute not found')

    const dateStr = d.createdAt ? d.createdAt.toISOString().slice(0, 10) : ''
    const statusLower = normalizeStatus(d.status)

    const items = (d.order?.orderLineItems || []).map((li) => {
      const media = li.product?.media?.[0]?.mediaUrl
      return {
        id: li.id,
        productName: li.product?.title || '',
        orderId: d.order?.orderNumber || d.order?.id || '',
        reason: d.issueReason || '',
        image: media ? absolutizeUrl(media, baseUrl) : null,
      }
    })

    const messages = (d.messages || []).map((m) => {
      const isSenderSelf = authId && m.senderId === authId
      return {
        id: m.id,
        senderId: m.senderId,
        author: m.sender?.name || (isSenderSelf ? 'Eu' : 'Utilizador'),
        roleLabel: String(m.sender?.role || m.senderRole || '').toLowerCase(),
        role: String(m.sender?.role || m.senderRole || '').toLowerCase(),
        align: isSenderSelf ? 'right' : 'left',
        at: m.createdAt
          ? m.createdAt.toLocaleTimeString('pt-PT', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '',
        text: m.messageText || '',
      }
    })

    return {
      status: 200,
      body: {
        id: d.id,
        disputeId: d.id,
        orderId: d.order?.orderNumber || d.order?.id || '',
        orderDate: d.order?.createdAt
          ? d.order.createdAt.toISOString().slice(0, 10)
          : '',
        status: statusLower,
        createdAt: dateStr,
        description: d.issueReason || '',
        title: d.issueReason || 'Disputa de Encomenda',
        seller: d.accused?.name || d.order?.seller?.name || '',
        customer: d.accuser?.name || '',
        supplier: d.accused?.name || d.order?.seller?.name || '',
        issue: d.issueReason || '',
        registered: dateStr,
        messageCount: messages.length,
        items,
        evidence: (d.evidences || []).map((e) =>
          absolutizeUrl(e.fileUrl, baseUrl),
        ),
        messages,
        chat: {
          type: 'DISPUTE',
          disputeId: d.id,
        },
      },
    }
  }

  async create(auth, body, baseUrl) {
    const authId = auth?.id
    if (!authId) throw httpError('Unauthorized', 401, 'Unauthorized')

    const orderRef = String(body.orderNumber || body.orderId || '').trim()
    const issueReason = String(body.issue || body.reason || body.description || '').trim()

    if (!orderRef) throw httpError('Order number is required', 400, 'ValidationError')
    if (!issueReason) throw httpError('Issue reason is required', 400, 'ValidationError')

    const order = await prisma.order.findFirst({
      where: {
        customerId: authId,
        OR: [{ orderNumber: orderRef }, { id: orderRef }],
      },
      select: ORDER_SELECT,
    })
    if (!order) throw notFound('Order not found')

    const accusedUserId = order.sellerId || order.seller?.id
    if (!accusedUserId) throw httpError('Seller not found for this order', 400, 'ValidationError')

    const created = await prisma.dispute.create({
      data: {
        orderId: order.id,
        accuserUserId: authId,
        accusedUserId,
        issueReason,
        status: 'OPEN',
      },
    })

    const evidenceUrls = Array.isArray(body.evidence) ? body.evidence : []
    if (evidenceUrls.length > 0) {
      await prisma.disputeEvidence.createMany({
        data: evidenceUrls.map((url) => ({
          disputeId: created.id,
          fileUrl: String(url),
        })),
      })
    }

    if (body.description) {
      await prisma.disputeMessage.create({
        data: {
          disputeId: created.id,
          senderId: authId,
          senderRole: (auth.role || 'CUSTOMER').toUpperCase(),
          messageText: String(body.description),
        },
      })
    }

    return this.getById(created.id, auth, baseUrl)
  }
}

export default new BuyerDisputesService()
