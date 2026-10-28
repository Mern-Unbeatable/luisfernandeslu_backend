/** Withdrawal request status: DB enum `PayoutStatus` <-> API labels. */

export function payoutStatusLabel(status) {
  const key = String(status || '').toUpperCase()
  if (key === 'COMPLETED') return 'paid'
  if (key === 'PROCESSING') return 'approved'
  if (key === 'REJECTED') return 'rejected'
  return 'pending'
}

export function toPayoutDbStatus(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'paid' || s === 'completed') return 'COMPLETED'
  if (s === 'approved' || s === 'processing') return 'PROCESSING'
  if (s === 'rejected') return 'REJECTED'
  if (s === 'pending') return 'PENDING'
  return null
}

export function payoutStatusFilter(raw) {
  const status = toPayoutDbStatus(raw)
  return status ? { status } : {}
}

export function isOpenPayout(status) {
  return status === 'PENDING' || status === 'PROCESSING'
}
