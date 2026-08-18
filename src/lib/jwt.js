import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

function getSecret() {
  if (!env.jwt.secret) {
    throw new Error('JWT_SECRET (or BETTER_AUTH_SECRET) is not configured')
  }
  return env.jwt.secret
}

/**
 * Access token only — payload carries role for client/guards.
 * @param {{ id: string, email: string, role: string, status?: string, name?: string }} user
 * @param {{ expiresIn?: string }} [options]
 */
export function signAccessToken(user, options = {}) {
  const role = String(user.role || '').toLowerCase()
  const payload = {
    sub: user.id,
    id: user.id,
    email: user.email,
    role,
    status: user.status || null,
    name: user.name || null,
  }

  return jwt.sign(payload, getSecret(), {
    expiresIn: options.expiresIn || env.jwt.expiresIn,
  })
}

/** Short-lived token after forgot-password OTP verify (default 10m). */
export function signPasswordResetToken(user) {
  return signAccessToken(
    {
      id: user.id,
      email: user.email,
      name: 'password-reset',
      role: 'password_reset',
      status: 'PASSWORD_RESET',
    },
    { expiresIn: env.jwt.resetExpiresIn },
  )
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getSecret())
}

/** Extract Bearer token from Express/Node headers object. */
export function extractBearerToken(headers = {}) {
  const raw =
    headers.authorization ||
    headers.Authorization ||
    (typeof headers.get === 'function' ? headers.get('authorization') : null)

  if (!raw || typeof raw !== 'string') return null
  const [type, token] = raw.split(' ')
  if (type?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

export default {
  signAccessToken,
  signPasswordResetToken,
  verifyAccessToken,
  extractBearerToken,
}
