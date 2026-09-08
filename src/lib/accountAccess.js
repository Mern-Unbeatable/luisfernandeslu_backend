/**
 * Account statuses that must not authenticate at all.
 * SUSPENDED is intentionally allowed — rejected supplier/factory/transporter
 * accounts must log in to re-upload documents while the panel stays locked.
 */
export const AUTH_DENIED_STATUSES = new Set(['BLOCKED'])

export function isAuthDeniedStatus(status) {
  return AUTH_DENIED_STATUSES.has(String(status || '').toUpperCase())
}

export function accountDisabledMessage(status) {
  return `Account is ${String(status || 'disabled').toLowerCase()}`
}
