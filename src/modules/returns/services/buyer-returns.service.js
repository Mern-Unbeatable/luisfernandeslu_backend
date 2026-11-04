import prisma from '../../../../lib/prisma.js'
import { notFound, httpError } from '../../../shared/errors.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'

function normalizeStatus(value) {
  return String(value ?? '').trim().toLowerCase() || 'pending'
}

export class BuyerReturnsService {
  async listOrders(authId, baseUrl) {
    if (!authId) {
      return { status: 200, body: { orders: [] } }
    }

    const orders = await prisma.order.findMany({
      where: {
        customerId: authId,
      },
      include: {
        orderLineItems: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                media: {
                  take: 1,
                  select: { mediaUrl: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    const mapped = orders.map((o) => {
      const thumbnails = (o.orderLineItems || [])
        .map((li) => {
          const url = li.product?.media?.[0]?.mediaUrl
          return url ? absolutizeUrl(url, baseUrl) : null
        })
        .filter(Boolean)

      return {
        id: o.id,
        orderNumber: o.orderNumber,
        date: o.createdAt ? o.createdAt.toISOString().slice(0, 10) : '',
        status: String(o.orderStatus || '').toLowerCase(),
        itemCount: o.orderLineItems?.length || 0,
        thumbnails,
      }
    })

    return { status: 200, body: { orders: mapped } }
  }

  async getOrder(orderId, authId, baseUrl) {
    const order = await prisma.order.findFirst({
      where: {
        customerId: authId,
        OR: [{ id: orderId }, { orderNumber: orderId }],
      },
      include: {
        orderLineItems: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                media: {
                  take: 1,
                  select: { mediaUrl: true },
                },
              },
            },
            returnRequests: {
              select: { id: true, status: true },
            },
          },
        },
      },
    })

    if (!order) throw notFound('Order not found')

    const items = (order.orderLineItems || []).map((li) => {
      const media = li.product?.media?.[0]?.mediaUrl
      const activeReturn = li.returnRequests?.[0]
      return {
        id: li.id,
        title: li.product?.title || '',
        quantity: li.quantity,
        price: `€${(Number(li.unitPriceLocked) || 0).toFixed(2)}`,
        image: media ? absolutizeUrl(media, baseUrl) : null,
        returnId: activeReturn?.id || null,
      }
    })

    return {
      status: 200,
      body: {
        id: order.id,
        orderNumber: order.orderNumber,
        placedDate: order.createdAt ? order.createdAt.toISOString().slice(0, 10) : '',
        status: String(order.orderStatus || '').toLowerCase(),
        items,
      },
    }
  }

  async listRequests(authId, baseUrl) {
    if (!authId) {
      return { status: 200, body: { returns: [] } }
    }

    const list = await prisma.returnRequest.findMany({
      where: {
        order: {
          customerId: authId,
        },
      },
      include: {
        order: {
          select: { id: true, orderNumber: true },
        },
        orderLineItem: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                media: {
                  take: 1,
                  select: { mediaUrl: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const mapped = list.map((r) => {
      const media = r.orderLineItem?.product?.media?.[0]?.mediaUrl
      return {
        id: r.id,
        displayId: r.id,
        title: r.orderLineItem?.product?.title || 'Material',
        reason: r.reason || '',
        status: normalizeStatus(r.status),
        updatedAt: r.createdAt ? r.createdAt.toISOString().slice(0, 10) : '',
        image: media ? absolutizeUrl(media, baseUrl) : null,
      }
    })

    return { status: 200, body: { returns: mapped } }
  }

  async getRequest(returnId, authId, baseUrl) {
    const r = await prisma.returnRequest.findFirst({
      where: {
        id: returnId,
        order: {
          customerId: authId,
        },
      },
      include: {
        order: {
          select: { id: true, orderNumber: true },
        },
        orderLineItem: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                media: {
                  take: 1,
                  select: { mediaUrl: true },
                },
              },
            },
          },
        },
        evidences: true,
      },
    })

    if (!r) throw notFound('Return request not found')

    const dateStr = r.createdAt ? r.createdAt.toISOString().slice(0, 10) : ''
    const media = r.orderLineItem?.product?.media?.[0]?.mediaUrl

    return {
      status: 200,
      body: {
        id: r.id,
        displayId: r.id,
        status: normalizeStatus(r.status),
        submittedOn: dateStr,
        reason: r.reason || '',
        description: r.description || '',
        evidence: (r.evidences || []).map((e) => absolutizeUrl(e.fileUrl, baseUrl)),
        product: {
          title: r.orderLineItem?.product?.title || '',
          orderId: r.order?.orderNumber || r.order?.id || '',
          image: media ? absolutizeUrl(media, baseUrl) : null,
        },
        timeline: [
          {
            status: normalizeStatus(r.status),
            date: dateStr,
            actor: 'BUYER',
          },
        ],
      },
    }
  }

  async createRequest(auth, body, baseUrl) {
    const authId = auth?.id
    if (!authId) throw httpError('Unauthorized', 401, 'Unauthorized')

    const lineItemId = String(body.lineItemId || body.orderLineItemId || '').trim()
    const reason = String(body.reason || '').trim()
    const description = String(body.description || '').trim()

    if (!lineItemId) throw httpError('lineItemId is required', 400, 'ValidationError')
    if (!reason) throw httpError('reason is required', 400, 'ValidationError')

    const lineItem = await prisma.orderLineItem.findFirst({
      where: {
        id: lineItemId,
        order: {
          customerId: authId,
        },
      },
      include: {
        order: true,
      },
    })

    if (!lineItem) throw notFound('Order line item not found')

    const quantity = Number(body.quantity) || lineItem.quantity || 1
    const refundAmount = Number(body.refundAmount) || (Number(lineItem.unitPriceLocked) || 0) * quantity

    const created = await prisma.returnRequest.create({
      data: {
        orderId: lineItem.orderId,
        orderLineItemId: lineItem.id,
        reason,
        description,
        quantity,
        refundAmount,
        refundAccount: body.refundAccount || null,
        status: 'PENDING',
      },
    })

    const evidenceUrls = Array.isArray(body.evidence) ? body.evidence : []
    if (evidenceUrls.length > 0) {
      await prisma.returnEvidence.createMany({
        data: evidenceUrls.map((url) => ({
          returnRequestId: created.id,
          fileUrl: String(url),
        })),
      })
    }

    return this.getRequest(created.id, authId, baseUrl)
  }
}

export default new BuyerReturnsService()
