import prisma from '../../../../lib/prisma.js'
import { notFound } from '../../../shared/errors.js'
import { emitToDispute } from '../../../socket/io.js'

function normalizeStatus(value) {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'open') return 'pending'
  return v || 'pending'
}

function toPrismaStatus(status) {
  const map = {
    pending: 'OPEN',
    open: 'OPEN',
    under_review: 'UNDER_REVIEW',
    resolved: 'RESOLVED',
    approved: 'RESOLVED',
    rejected: 'REJECTED',
  }
  return map[normalizeStatus(status)] || 'OPEN'
}

export class StaffDisputesService {
  async list(auth) {
    const isSupplier = auth?.role === 'supplier'
    const supplierId = auth?.id

    const where = isSupplier
      ? {
          OR: [
            { accusedUserId: supplierId },
            { accuserUserId: supplierId },
            { order: { sellerId: supplierId } },
          ],
        }
      : {}

    const list = await prisma.dispute.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            seller: { select: { id: true, name: true } },
          },
        },
        accuser: {
          select: { id: true, name: true, email: true },
        },
        accused: {
          select: { id: true, name: true, email: true },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const mapped = list.map((d) => {
      const statusLower = normalizeStatus(d.status)
      return {
        id: d.id,
        disputeId: d.id,
        orderId: d.order?.orderNumber || d.order?.id || '',
        customer: d.accuser?.name || 'Cliente',
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

  async getById(disputeId, auth) {
    const isSupplier = auth?.role === 'supplier'
    const supplierId = auth?.id

    const d = await prisma.dispute.findFirst({
      where: {
        id: disputeId,
        ...(isSupplier
          ? {
              OR: [
                { accusedUserId: supplierId },
                { accuserUserId: supplierId },
                { order: { sellerId: supplierId } },
              ],
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

    const items = (d.order?.orderLineItems || []).map((li) => ({
      id: li.id,
      productName: li.product?.title || '',
      orderId: d.order?.orderNumber || d.order?.id || '',
      reason: d.issueReason || '',
      image: li.product?.media?.[0]?.mediaUrl || '',
    }))

    const messages = (d.messages || []).map((m) => {
      const isSenderSelf = auth?.id && m.senderId === auth.id
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
        evidence: (d.evidences || []).map((e) => e.fileUrl),
        messages,
        chat: {
          type: 'DISPUTE',
          disputeId: d.id,
        },
      },
    }
  }

  async updateStatus(disputeId, status, auth) {
    const isSupplier = auth?.role === 'supplier'
    const supplierId = auth?.id

    const existing = await prisma.dispute.findFirst({
      where: {
        id: disputeId,
        ...(isSupplier
          ? {
              OR: [
                { accusedUserId: supplierId },
                { accuserUserId: supplierId },
                { order: { sellerId: supplierId } },
              ],
            }
          : {}),
      },
      select: { id: true },
    })

    if (!existing) throw notFound('Dispute not found')

    const prismaStatus = toPrismaStatus(status)
    const updated = await prisma.dispute.update({
      where: { id: disputeId },
      data: { status: prismaStatus },
    })

    const statusLower = normalizeStatus(updated.status)
    emitToDispute(disputeId, 'dispute:status', {
      disputeId,
      status: statusLower,
    })

    return {
      status: 200,
      body: {
        id: updated.id,
        disputeId: updated.id,
        status: statusLower,
      },
    }
  }
}

export default new StaffDisputesService()
