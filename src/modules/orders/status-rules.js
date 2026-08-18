export const ORDER_STATUSES = [
  'NEW',
  'PENDING',
  'PROCESSING',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
]

export const STATUS_TRANSITIONS = {
  PENDING: {
    from: ['NEW'],
    invalid: 'Only NEW orders can be accepted (→ PENDING)',
    message: 'Order accepted',
    note: (kind) =>
      kind === 'company'
        ? 'Supplier accepted company order'
        : 'Supplier accepted order',
  },
  PROCESSING: {
    from: ['PENDING'],
    invalid: 'Only PENDING orders can move to PROCESSING',
    message: 'Order marked as processing',
    note: (kind) =>
      kind === 'company'
        ? 'Supplier marked company order as processing'
        : 'Supplier marked order as processing',
  },
  CANCELLED: {
    from: ['NEW', 'PENDING', 'PROCESSING'],
    invalid: 'Order cannot be cancelled in current status',
    message: 'Order cancelled',
    note: (_kind, reason) => reason?.trim() || 'Order cancelled by supplier',
  },
}

export function normalizeStatusFilter(raw) {
  if (!raw || raw === 'all') return null
  const s = String(raw).trim().toLowerCase()
  if (s === 'new') return 'NEW'
  if (s === 'pending') return 'PENDING'
  if (s === 'processing') return 'PROCESSING'
  if (s === 'assigned') return { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] }
  if (s === 'cancel' || s === 'cancelled') return 'CANCELLED'
  if (s === 'completed') return { in: ['COMPLETED', 'DELIVERED'] }
  const upper = String(raw).toUpperCase()
  if (ORDER_STATUSES.includes(upper)) return upper
  return null
}

export function normalizeActionStatus(raw) {
  const s = String(raw || '').trim().toUpperCase()
  if (s === 'ACCEPT' || s === 'PENDING') return 'PENDING'
  if (s === 'PROCESSING') return 'PROCESSING'
  if (s === 'CANCEL' || s === 'CANCELLED') return 'CANCELLED'
  return null
}

export function buildOrderActions(order, transporter) {
  const isNew = order.orderStatus === 'NEW'
  const isAssigned =
    order.orderStatus === 'ASSIGNED' ||
    order.orderStatus === 'PICKED_UP' ||
    order.orderStatus === 'IN_TRANSIT'
  const isCancel = order.orderStatus === 'CANCELLED'
  const hasInvoice = Boolean(order.invoices?.[0] || order.hasInvoice)

  return {
    canAccept: isNew,
    canMarkProcessing: order.orderStatus === 'PENDING',
    canCancel: ['NEW', 'PENDING', 'PROCESSING'].includes(order.orderStatus),
    showDownloadInvoice: !isNew,
    canDownloadInvoice: !isNew,
    hasInvoice,
    showTransporter: isAssigned || (isCancel && Boolean(transporter)),
    canMessageTransporter: isAssigned && Boolean(transporter),
  }
}
