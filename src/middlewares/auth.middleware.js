import {
  extractBearerToken,
  verifyAccessToken,
} from '../lib/jwt.js'
import prisma from '../../lib/prisma.js'
import { sendError } from '../utils/apiResponse.js'
import { AppError } from '../utils/AppError.js'

/**
 * Shared auth middleware — use on any protected route:
 *   import { requireAccessToken } from '../../middlewares/auth.middleware.js'
 *
 * Expects: Authorization: Bearer <accessToken>
 * Sets: req.auth = { id, email, role, status, name }
 */
export function requireAccessToken(req, res, next) {
  try {
    const token = extractBearerToken(req.headers)
    if (!token) {
      return sendError(
        res,
        401,
        'Access token required. Send Authorization: Bearer <token>',
        { error: 'Unauthorized' },
      )
    }

    const payload = verifyAccessToken(token)
    req.auth = {
      id: payload.id || payload.sub,
      email: payload.email,
      role: String(payload.role || '').toLowerCase(),
      status: payload.status,
      name: payload.name,
    }
    next()
  } catch (err) {
    return sendError(
      res,
      401,
      err.name === 'TokenExpiredError'
        ? 'Access token expired'
        : 'Invalid access token',
      { error: 'Unauthorized' },
    )
  }
}

/**
 * Optional Bearer auth for public routes (guest OK).
 * Sets req.auth when token is valid; otherwise req.auth = null.
 * Invalid/expired token → still continues as guest (does not 401).
 */
export function optionalAccessToken(req, _res, next) {
  try {
    const token = extractBearerToken(req.headers)
    if (!token) {
      req.auth = null
      return next()
    }
    const payload = verifyAccessToken(token)
    req.auth = {
      id: payload.id || payload.sub,
      email: payload.email,
      role: String(payload.role || '').toLowerCase(),
      status: payload.status,
      name: payload.name,
    }
  } catch {
    req.auth = null
  }
  return next()
}

/** Require one of the allowed roles (after requireAccessToken). */
export function requireRoles(...roles) {
  const allowed = roles.map((r) => String(r).toLowerCase())
  return (req, res, next) => {
    if (!req.auth?.role) {
      return sendError(res, 401, 'Not authenticated', { error: 'Unauthorized' })
    }
    if (!allowed.includes(req.auth.role)) {
      return sendError(res, 403, 'Insufficient role permissions', {
        error: 'Forbidden',
      })
    }
    next()
  }
}

/** Load fresh user from DB onto req.user */
export async function requireAccessTokenWithUser(req, res, next) {
  requireAccessToken(req, res, async () => {
    if (res.headersSent) return

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.auth.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          phoneNumber: true,
          image: true,
          emailVerified: true,
        },
      })

      if (!user) {
        return sendError(res, 401, 'User not found', { error: 'Unauthorized' })
      }

      if (user.status === 'BLOCKED' || user.status === 'SUSPENDED') {
        return sendError(
          res,
          403,
          `Account is ${String(user.status).toLowerCase()}`,
          { error: 'AccountDisabled' },
        )
      }

      req.user = {
        ...user,
        role: String(user.role).toLowerCase(),
      }
      next()
    } catch (e) {
      next(e)
    }
  })
}

/** Throw AppError helper for services */
export function assertAuth(condition, message, statusCode = 403, code = 'Forbidden') {
  if (!condition) throw new AppError(message, statusCode, code)
}

export default {
  requireAccessToken,
  optionalAccessToken,
  requireRoles,
  requireAccessTokenWithUser,
}
