import { randomUUID } from 'node:crypto'
import { fromNodeHeaders } from 'better-auth/node'
import prisma from '../../../../lib/prisma.js'
import { auth } from '../../../auth/auth.js'
import { isSocialRole } from '../../../auth/roles.js'
import { env, getCorsOrigins } from '../../../config/env.js'
import { formatProfileForResponse } from '../../../lib/requestUrl.js'
import {
  accountDisabledMessage,
  isAuthDeniedStatus,
} from '../../../lib/accountAccess.js'
import {
  signAccessToken,
  signSocialLoginCode,
  verifySocialLoginCode,
} from '../../../lib/jwt.js'
import { httpError } from '../../../shared/errors.js'

const FRONTEND_CALLBACK_PATH = '/auth/google/callback'

/** Codes already exchanged, kept until they expire so each works only once. */
const usedCodes = new Map()

function rememberUsedCode(jti, expSeconds) {
  const now = Date.now()
  for (const [key, expiresAt] of usedCodes) {
    if (expiresAt <= now) usedCodes.delete(key)
  }
  usedCodes.set(jti, expSeconds * 1000)
}

function isAllowedFrontendOrigin(origin) {
  try {
    const { hostname } = new URL(origin)
    return (
      getCorsOrigins().includes(origin) ||
      hostname === 'maktechgroup.tech' ||
      hostname.endsWith('.maktechgroup.tech')
    )
  } catch {
    return false
  }
}

/** Only redirect back to our own frontends. */
export function resolveFrontendOrigin(value) {
  const origin = String(value || '').trim().replace(/\/+$/, '')
  return origin && isAllowedFrontendOrigin(origin) ? origin : env.frontendUrl
}

/** Internal path to return to after login (e.g. /returns); never another site. */
function resolveNextPath(value) {
  const next = String(value || '').trim()
  return next.startsWith('/') && !next.startsWith('//') ? next : ''
}

function frontendCallbackUrl(origin, params) {
  const hash = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v),
  ).toString()
  return `${origin}${FRONTEND_CALLBACK_PATH}#${hash}`
}

function completeUrl(origin, next) {
  const url = new URL(`${env.apiUrl}/api/social/google/complete`)
  url.searchParams.set('redirect', origin)
  if (next) url.searchParams.set('next', next)
  return url.toString()
}

export class SocialAuthService {
  /** Step 1: redirect the browser to Google. */
  async startGoogle(query, headers) {
    const role = isSocialRole(query.role) ? String(query.role).toLowerCase() : 'customer'
    const origin = resolveFrontendOrigin(query.redirect)
    const next = resolveNextPath(query.next)
    const callbackURL = completeUrl(origin, next)

    try {
      const result = await auth.api.signInSocial({
        body: {
          provider: 'google',
          callbackURL,
          errorCallbackURL: callbackURL,
          additionalData: { role },
          disableRedirect: true,
        },
        headers: fromNodeHeaders(headers),
        returnHeaders: true,
      })
      const url = result?.response?.url
      if (!url) throw new Error('Google sign-in URL missing')
      return {
        redirectTo: url,
        cookies: result.headers?.getSetCookie?.() || [],
      }
    } catch (err) {
      console.error('[google-login] could not start Google sign-in:', err?.message || err)
      return {
        redirectTo: frontendCallbackUrl(origin, { error: 'google_unavailable' }),
        cookies: [],
      }
    }
  }

  /** Step 2: Google finished; hand the frontend a one-time code. */
  async completeGoogle(query, headers) {
    const origin = resolveFrontendOrigin(query.redirect)
    const next = resolveNextPath(query.next)
    const fail = (error) => frontendCallbackUrl(origin, { error })

    // Better Auth reports a blocked link (see account hook in auth.js) this way
    if (query.error === 'unable_to_link_account') return fail('email_in_use')
    if (query.error) return fail(String(query.error))

    const session = await auth.api
      .getSession({ headers: fromNodeHeaders(headers) })
      .catch(() => null)
    const userId = session?.user?.id
    if (!userId) return fail('session_missing')

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, emailVerified: true },
    })
    if (!user) return fail('session_missing')
    if (!isSocialRole(user.role)) return fail('email_in_use')
    if (isAuthDeniedStatus(user.status)) return fail('account_disabled')

    // Google already confirmed the email, so the signup OTP step is not needed
    if (!user.emailVerified || user.status === 'PENDING_VERIFICATION') {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          ...(user.status === 'PENDING_VERIFICATION' ? { status: 'ACTIVE' } : {}),
        },
      })
    }

    const code = signSocialLoginCode(user.id, randomUUID())
    return frontendCallbackUrl(origin, { code, next })
  }

  /** Step 3: the frontend swaps the code for the normal login response. */
  async exchangeCode(body, baseUrl) {
    let payload
    try {
      payload = verifySocialLoginCode(String(body?.code || ''))
    } catch {
      throw httpError('Login link expired, please try again', 401, 'InvalidLoginCode')
    }
    if (!payload.jti || usedCodes.has(payload.jti)) {
      throw httpError('Login link already used, please try again', 401, 'InvalidLoginCode')
    }
    rememberUsedCode(payload.jti, payload.exp)

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        phoneNumber: true,
        image: true,
        emailVerified: true,
        profile: true,
      },
    })
    if (!user || !isSocialRole(user.role)) {
      throw httpError('Account not found', 401, 'InvalidLoginCode')
    }
    if (isAuthDeniedStatus(user.status)) {
      throw httpError(accountDisabledMessage(user.status), 403, 'AccountDisabled')
    }

    const role = String(user.role).toLowerCase()
    const accessToken = signAccessToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role,
      status: user.status,
    })

    return {
      status: 200,
      body: {
        accessToken,
        tokenType: 'Bearer',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role,
          status: user.status,
          phoneNumber: user.phoneNumber,
          image: user.image,
          emailVerified: user.emailVerified,
        },
        profile: formatProfileForResponse(user.profile, baseUrl || env.apiUrl, role),
        message: 'Login successful',
      },
    }
  }
}

export default new SocialAuthService()
