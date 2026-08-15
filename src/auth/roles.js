/** Public signup roles (lowercase route params ↔ Prisma UserRole). */
export const PUBLIC_ROLES = [
  'customer',
  'company',
  'supplier',
  'factory',
  'transporter',
  'affiliate',
]

/** Roles allowed on login routes (includes admin — no public signup). */
export const LOGIN_ROLES = [...PUBLIC_ROLES, 'admin']

/** Roles allowed to use Google / Facebook. */
export const SOCIAL_ROLES = new Set(['customer', 'company'])

/** Email/password signup OTP — ONLY customer + company. Never other roles. */
export const EMAIL_OTP_ROLES = new Set(['customer', 'company'])

/**
 * Admin document review required — account stays PENDING_VERIFICATION.
 * Affiliate is NOT here: registers as ACTIVE immediately.
 */
export const PENDING_ROLES = new Set(['supplier', 'factory', 'transporter'])

export function toUserRole(role) {
  if (!role) return null
  return String(role).trim().toUpperCase()
}

export function isPublicRole(role) {
  return PUBLIC_ROLES.includes(String(role || '').toLowerCase())
}

export function isLoginRole(role) {
  return LOGIN_ROLES.includes(String(role || '').toLowerCase())
}

export function isSocialRole(role) {
  return SOCIAL_ROLES.has(String(role || '').toLowerCase())
}

/** True only for customer/company — email/password register OTP gate. */
export function requiresEmailOtp(role) {
  return EMAIL_OTP_ROLES.has(String(role || '').toLowerCase())
}

export function requiresAdminReview(role) {
  return PENDING_ROLES.has(String(role || '').toLowerCase())
}

/**
 * Account status after register:
 * - customer/company (awaiting email OTP) → PENDING_VERIFICATION
 * - supplier/factory/transporter (admin review) → PENDING_VERIFICATION
 * - affiliate (auto-verified) → ACTIVE
 * - else → ACTIVE
 */
export function defaultStatusForRole(role) {
  const key = String(role || '').toLowerCase()
  if (requiresEmailOtp(key) || requiresAdminReview(key)) {
    return 'PENDING_VERIFICATION'
  }
  return 'ACTIVE'
}
