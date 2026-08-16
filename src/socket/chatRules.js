/**
 * Live chat access rules (DB + socket).
 *
 * QUOTE: company ↔ supplier only (after QuoteRequest exists). Customer never.
 * ORDER_TRANSPORT: after transporter assigned — buyer + seller + transporter.
 * FACTORY_SUPPLIER: supplier ↔ factory (product seller must be factory).
 * ADMIN_SUPPORT: admin ↔ any one peer user.
 * Admin may join / message any existing thread.
 */

import prisma from '../../lib/prisma.js'

export const CHAT_ROLES = [
  'customer',
  'company',
  'supplier',
  'factory',
  'transporter',
  'admin',
]

export function normalizeRole(role) {
  return String(role || '').toLowerCase()
}

export function isAdmin(role) {
  return normalizeRole(role) === 'admin'
}

/**
 * Resolve assigned transporter userId for an order (vehicle owner or accepted bid).
 */
export async function resolveAssignedTransporterId(orderId) {
  const shipment = await prisma.shipment.findUnique({
    where: { orderId },
    select: {
      vehicle: { select: { transporterId: true } },
      auction: {
        select: {
          bids: {
            where: { status: 'ACCEPTED' },
            take: 1,
            select: { transporterId: true },
          },
        },
      },
    },
  })
  if (!shipment) return null
  if (shipment.vehicle?.transporterId) return shipment.vehicle.transporterId
  const bid = shipment.auction?.bids?.[0]
  return bid?.transporterId || null
}

export async function userIsParticipant(threadId, userId) {
  const row = await prisma.chatThreadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId } },
    select: { userId: true },
  })
  return Boolean(row)
}

/**
 * Can this user join/message this thread?
 */
export async function canAccessThread(user, thread) {
  if (!user?.id || !thread) return false
  const role = normalizeRole(user.role)
  if (isAdmin(role)) return true
  return userIsParticipant(thread.id, user.id)
}

/**
 * Validate opening a new / existing thread by context.
 * Returns { ok, error, allowedUserIds, meta } for thread creation.
 */
export async function assertCanOpenThread(user, payload = {}) {
  const role = normalizeRole(user.role)
  const type = String(payload.type || '').toUpperCase()

  if (isAdmin(role) && type === 'ADMIN_SUPPORT') {
    const peerUserId = payload.peerUserId
    if (!peerUserId) {
      return { ok: false, error: 'peerUserId is required for ADMIN_SUPPORT' }
    }
    if (peerUserId === user.id) {
      return { ok: false, error: 'Cannot open support chat with yourself' }
    }
    const peer = await prisma.user.findUnique({
      where: { id: peerUserId },
      select: { id: true, role: true },
    })
    if (!peer) return { ok: false, error: 'Peer user not found' }
    return {
      ok: true,
      type: 'ADMIN_SUPPORT',
      allowedUserIds: [user.id, peerUserId],
      meta: { peerUserId },
    }
  }

  if (type === 'QUOTE') {
    // Customer cannot open supplier quote chat
    if (role === 'customer') {
      return {
        ok: false,
        error: 'Customer cannot chat with supplier. Use transporter chat after assignment.',
      }
    }
    if (role !== 'company' && role !== 'supplier' && !isAdmin(role)) {
      return { ok: false, error: 'Only company or supplier can open quote chat' }
    }
    const quoteRequestId = payload.quoteRequestId || payload.quoteId
    if (!quoteRequestId) {
      return { ok: false, error: 'quoteRequestId is required' }
    }
    const quote = await prisma.quoteRequest.findUnique({
      where: { id: quoteRequestId },
      select: { id: true, buyerId: true, sellerId: true },
    })
    if (!quote) return { ok: false, error: 'Quote not found' }
    if (
      !isAdmin(role) &&
      user.id !== quote.buyerId &&
      user.id !== quote.sellerId
    ) {
      return { ok: false, error: 'Not a participant of this quote' }
    }
    return {
      ok: true,
      type: 'QUOTE',
      allowedUserIds: [quote.buyerId, quote.sellerId],
      meta: { quoteRequestId: quote.id },
    }
  }

  if (type === 'ORDER_TRANSPORT') {
    const orderId = payload.orderId
    if (!orderId) return { ok: false, error: 'orderId is required' }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, sellerId: true },
    })
    if (!order) return { ok: false, error: 'Order not found' }

    const transporterId = await resolveAssignedTransporterId(orderId)
    if (!transporterId) {
      return {
        ok: false,
        error: 'Transporter is not assigned yet for this order',
      }
    }

    const allowed = [order.customerId, order.sellerId, transporterId]
    if (!isAdmin(role) && !allowed.includes(user.id)) {
      return {
        ok: false,
        error: 'Only buyer, supplier, or assigned transporter can open this chat',
      }
    }

    // Customer may only use ORDER_TRANSPORT (already enforced by type)
    return {
      ok: true,
      type: 'ORDER_TRANSPORT',
      allowedUserIds: allowed,
      meta: { orderId, transporterId },
    }
  }

  if (type === 'FACTORY_SUPPLIER') {
    if (
      role !== 'supplier' &&
      role !== 'factory' &&
      !isAdmin(role)
    ) {
      return {
        ok: false,
        error: 'Only supplier or factory can open factory product chat',
      }
    }
    const productId = payload.productId
    if (!productId) return { ok: false, error: 'productId is required' }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        sellerId: true,
        seller: { select: { id: true, role: true } },
      },
    })
    if (!product) return { ok: false, error: 'Product not found' }

    const factoryRole = normalizeRole(product.seller?.role)
    if (factoryRole !== 'factory') {
      return {
        ok: false,
        error: 'Product is not owned by a factory',
      }
    }

    const factoryId = product.sellerId
    let supplierId = payload.supplierId || null

    if (role === 'supplier') {
      supplierId = user.id
      if (user.id === factoryId) {
        return { ok: false, error: 'Invalid participants' }
      }
    } else if (role === 'factory') {
      if (user.id !== factoryId) {
        return { ok: false, error: 'Only the product factory can open this chat' }
      }
      if (!supplierId) {
        return { ok: false, error: 'supplierId is required when factory opens chat' }
      }
      const supplier = await prisma.user.findUnique({
        where: { id: supplierId },
        select: { id: true, role: true },
      })
      if (!supplier || normalizeRole(supplier.role) !== 'supplier') {
        return { ok: false, error: 'supplierId must be a supplier user' }
      }
    } else if (isAdmin(role)) {
      if (!supplierId) {
        return { ok: false, error: 'supplierId is required' }
      }
    }

    return {
      ok: true,
      type: 'FACTORY_SUPPLIER',
      allowedUserIds: [factoryId, supplierId],
      meta: { productId, factoryId, supplierId },
    }
  }

  return { ok: false, error: `Unknown or unsupported chat type: ${type}` }
}

export default {
  CHAT_ROLES,
  normalizeRole,
  isAdmin,
  resolveAssignedTransporterId,
  userIsParticipant,
  canAccessThread,
  assertCanOpenThread,
}
