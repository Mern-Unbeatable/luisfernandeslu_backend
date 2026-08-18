export const FACTORY_ORDER_SOURCE = 'FACTORY_CONVERSION'

export const FACTORY_STATUSES = [
  'NEW',
  'IN_PRODUCTION',
  'PRODUCED',
  'READY',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'COMPLETED',
  'DELIVERED',
  'CANCELLED',
]

export const FACTORY_STATUS_LABELS = {
  NEW: 'New',
  IN_PRODUCTION: 'In Production',
  PRODUCED: 'Produced',
  READY: 'Ready',
  ASSIGNED: 'Assigned',
  PICKED_UP: 'Assigned',
  IN_TRANSIT: 'Assigned',
  COMPLETED: 'Completed',
  DELIVERED: 'Completed',
  CANCELLED: 'Cancel',
  PENDING: 'New',
  PROCESSING: 'In Production',
}

export const FACTORY_STATUS_TRANSITIONS = {
  IN_PRODUCTION: {
    from: ['NEW'],
    invalid: 'Only NEW factory orders can move to In Production',
    message: 'Order moved to In Production',
    note: 'Factory started production',
  },
  PRODUCED: {
    from: ['IN_PRODUCTION'],
    invalid: 'Only In Production orders can move to Produced',
    message: 'Order marked as Produced',
    note: 'Factory finished production',
  },
  READY: {
    from: ['PRODUCED'],
    invalid: 'Only Produced orders can move to Ready',
    message: 'Order marked as Ready',
    note: 'Factory marked order ready for transport',
  },
}

const TERMINAL = new Set([
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'COMPLETED',
  'DELIVERED',
  'CANCELLED',
])

export function factoryStatusLabel(status) {
  return FACTORY_STATUS_LABELS[status] || status || null
}

export function normalizeFactoryStatusFilter(raw) {
  if (!raw || raw === 'all') return null
  const s = String(raw).trim().toLowerCase().replace(/[_-]+/g, ' ')
  if (s === 'new') return 'NEW'
  if (s === 'in production') return 'IN_PRODUCTION'
  if (s === 'produced') return 'PRODUCED'
  if (s === 'ready') return 'READY'
  if (s === 'assigned') return { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] }
  if (s === 'cancel' || s === 'cancelled') return 'CANCELLED'
  if (s === 'completed') return { in: ['COMPLETED', 'DELIVERED'] }
  const upper = String(raw).trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (FACTORY_STATUSES.includes(upper)) return upper
  return null
}

export function normalizeFactoryActionStatus(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
  if (s === 'in production' || s === 'inproduction') return 'IN_PRODUCTION'
  if (s === 'produced') return 'PRODUCED'
  if (s === 'ready') return 'READY'
  const upper = String(raw || '').trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (FACTORY_STATUS_TRANSITIONS[upper]) return upper
  return null
}

export function canSupplierDeleteFactoryOrder(status) {
  return !TERMINAL.has(status)
}

export function buildFactoryOrderActions(order, viewer) {
  const status = order.orderStatus
  const isFactory = viewer === 'factory'
  const isSupplier = viewer === 'supplier'

  return {
    canViewDetails: true,
    canDelete: isSupplier && canSupplierDeleteFactoryOrder(status),
    canMarkInProduction: isFactory && status === 'NEW',
    canMarkProduced: isFactory && status === 'IN_PRODUCTION',
    canMarkReady: isFactory && status === 'PRODUCED',
    nextStatus: isFactory
      ? status === 'NEW'
        ? 'IN_PRODUCTION'
        : status === 'IN_PRODUCTION'
          ? 'PRODUCED'
          : status === 'PRODUCED'
            ? 'READY'
            : null
      : null,
  }
}
