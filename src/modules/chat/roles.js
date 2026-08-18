import { httpError } from '../../shared/errors.js'

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

/** REST + socket quote chat: company and supplier only. */
export function assertQuoteParticipantRole(auth) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  const role = String(auth.role || '').toLowerCase()
  if (role !== 'company' && role !== 'supplier') {
    throw httpError(
      'Only company or supplier can access quotes',
      403,
      'Forbidden',
    )
  }
  return role
}
