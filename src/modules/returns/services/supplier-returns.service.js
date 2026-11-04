import prisma from '../../../../lib/prisma.js'
import { notFound } from '../../../shared/errors.js'

function normalizeStatus(value) {
  return String(value ?? '').trim().toLowerCase() || 'pending'
}

function toPrismaStatus(status) {
  const map = {
    pending: 'PENDING',
    under_review: 'UNDER_REVIEW',
    approved: 'APPROVED',
    rejected: 'REJECTED',
    refunded: 'REFUNDED',
    item_received: 'UNDER_REVIEW',
    inspection_progress: 'UNDER_REVIEW',
    inspection_pass: 'APPROVED',
    inspection_rejected: 'REJECTED',
  }
  return map[normalizeStatus(status)] || 'PENDING'
}

export class SupplierReturnsService {
  async list(supplierId) {
    if (!supplierId) {
      return {
        status: 200,
        body: {
          returns: [],
          stats: { total: 0, pendingReview: 0, approved: 0, rejected: 0 },
          pagination: { page: 1, total: 0 },
        },
      }
    }

    const list = await prisma.returnRequest.findMany({
      where: {
        order: {
          sellerId: supplierId,
        },
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
        orderLineItem: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                sku: true,
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
      orderBy: { createdAt: 'desc' },
    })

    const mapped = list.map((r) => {
      const statusLower = normalizeStatus(r.status)
      return {
        id: r.id,
        returnId: r.id,
        orderId: r.order?.orderNumber || r.order?.id || '',
        customerName: r.order?.customer?.name || 'Cliente',
        customerEmail: r.order?.customer?.email || '',
        productName: r.orderLineItem?.product?.title || '',
        reason: r.reason || '',
        requestDate: r.createdAt ? r.createdAt.toISOString().slice(0, 10) : '',
        status: statusLower,
      }
    })

    const stats = {
      total: mapped.length,
      pendingReview: mapped.filter((r) =>
        ['pending', 'under_review'].includes(r.status),
      ).length,
      approved: mapped.filter((r) => r.status === 'approved').length,
      rejected: mapped.filter((r) => r.status === 'rejected').length,
    }

    return {
      status: 200,
      body: {
        returns: mapped,
        stats,
        pagination: { page: 1, total: mapped.length },
      },
    }
  }

  async getById(returnId, supplierId) {
    const r = await prisma.returnRequest.findFirst({
      where: {
        id: returnId,
        ...(supplierId ? { order: { sellerId: supplierId } } : {}),
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
        orderLineItem: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                sku: true,
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
    const statusLower = normalizeStatus(r.status)

    return {
      status: 200,
      body: {
        id: r.id,
        returnId: r.id,
        orderId: r.order?.orderNumber || r.order?.id || '',
        receivedDate: dateStr,
        status: statusLower,
        reason: r.reason || '',
        description: r.description || '',
        refundAccountNumber: r.refundAccount || '',
        refundAmount: `€${(Number(r.refundAmount) || 0).toFixed(2)}`,
        products: r.orderLineItem?.product
          ? [
              {
                id: r.orderLineItem.product.id,
                name: r.orderLineItem.product.title,
                sku: r.orderLineItem.product.sku,
                quantity: r.quantity,
                price: `€${(Number(r.orderLineItem.unitPriceLocked) || 0).toFixed(2)}`,
                image: r.orderLineItem.product.media?.[0]?.mediaUrl || '',
              },
            ]
          : [],
        evidence: (r.evidences || []).map((e) => e.fileUrl),
        customer: {
          id: r.order?.customer?.id || '',
          name: r.order?.customer?.name || 'Cliente',
          email: r.order?.customer?.email || '',
          phone: r.order?.customer?.phoneNumber || '',
          address: '',
          avatarColor: '#3B82F6',
        },
        orderSummary: {
          orderId: r.order?.orderNumber || r.order?.id || '',
          itemCount: r.quantity,
          requestDate: dateStr,
          totalValue: `€${(Number(r.refundAmount) || 0).toFixed(2)}`,
        },
      },
    }
  }

  async updateStatus(returnId, status, supplierId) {
    const existing = await prisma.returnRequest.findFirst({
      where: {
        id: returnId,
        ...(supplierId ? { order: { sellerId: supplierId } } : {}),
      },
      select: { id: true },
    })

    if (!existing) throw notFound('Return request not found')

    const prismaStatus = toPrismaStatus(status)
    const updated = await prisma.returnRequest.update({
      where: { id: returnId },
      data: { status: prismaStatus },
    })

    return {
      status: 200,
      body: {
        id: updated.id,
        status: normalizeStatus(updated.status),
        message: 'Status updated successfully',
      },
    }
  }
}

export default new SupplierReturnsService()
