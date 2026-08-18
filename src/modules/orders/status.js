import prisma from '../../../lib/prisma.js'
import { httpError } from '../../shared/errors.js'
import {
  STATUS_TRANSITIONS,
  normalizeActionStatus,
} from './status-rules.js'

export {
  ORDER_STATUSES,
  STATUS_TRANSITIONS,
  normalizeStatusFilter,
  normalizeActionStatus,
  buildOrderActions,
} from './status-rules.js'

export function assertSupplier(auth, message) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  const role = String(auth.role || '').toLowerCase()
  if (role !== 'supplier') {
    throw httpError(message, 403, 'Forbidden')
  }
  return auth.id
}

export async function applySupplierStatusChange({
  where,
  orderId,
  body,
  kind = 'customer',
}) {
  const nextStatus = normalizeActionStatus(body.status)
  if (!nextStatus) {
    throw httpError(
      'status must be PENDING (accept), PROCESSING, or CANCELLED',
      400,
      'InvalidStatus',
    )
  }

  const rule = STATUS_TRANSITIONS[nextStatus]
  const order = await prisma.order.findFirst({
    where: { id: orderId, ...where },
    select: { id: true, orderStatus: true, cancellationReason: true },
  })
  if (!order) throw httpError('Order not found', 404, 'NotFound')

  const current = order.orderStatus
  if (!rule.from.includes(current)) {
    throw httpError(rule.invalid, 400, 'InvalidTransition', {
      current,
      next: nextStatus,
    })
  }

  const note = rule.note(kind, body.reason)
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.order.update({
      where: { id: order.id },
      data: {
        orderStatus: nextStatus,
        ...(nextStatus === 'CANCELLED'
          ? { cancellationReason: body.reason.trim() }
          : {}),
      },
      select: {
        id: true,
        orderNumber: true,
        orderStatus: true,
        cancellationReason: true,
        updatedAt: true,
      },
    })
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, status: nextStatus, note },
    })
    return row
  })

  return {
    status: 200,
    body: {
      id: updated.id,
      orderNumber: updated.orderNumber,
      orderStatus: updated.orderStatus,
      cancelReason: updated.cancellationReason,
      message: rule.message,
    },
  }
}
