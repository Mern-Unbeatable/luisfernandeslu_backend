import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { getOAuthState } from 'better-auth/api'
import prisma from '../../lib/prisma.js'
import {
  defaultStatusForRole,
  isPublicRole,
  isSocialRole,
  requiresEmailOtp,
  toUserRole,
} from './roles.js'
import { env, getCorsOrigins } from '../config/env.js'

const baseURL = env.apiUrl

const socialProviders = {}

const google = env.betterAuth.google
if (google.clientId && google.clientSecret) {
  socialProviders.google = {
    clientId: google.clientId,
    clientSecret: google.clientSecret,
    prompt: 'select_account',
  }
}

/** Role chosen on the login/sign-up page, carried through the Google redirect. */
async function oauthSignupRole() {
  try {
    const state = await getOAuthState()
    return state?.role || null
  } catch {
    return null
  }
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  baseURL,
  secret: env.betterAuth.secret,
  trustedOrigins: getCorsOrigins(),
  emailAndPassword: {
    enabled: true,
    // Skip session create on sign-up — saves ~1–2 remote DB round-trips.
    // OTP roles never need a session until verify+login.
    // Other roles get signed in explicitly after register.
    autoSignIn: false,
  },
  socialProviders,
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: true,
        defaultValue: 'CUSTOMER',
        input: true,
      },
      phoneNumber: {
        type: 'string',
        required: false,
        input: true,
      },
      status: {
        type: 'string',
        required: false,
        defaultValue: 'PENDING_VERIFICATION',
        input: false,
      },
      referralCode: {
        type: 'string',
        required: false,
        input: false,
      },
      referredById: {
        type: 'string',
        required: false,
        input: false,
      },
      vatRate: {
        type: 'number',
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const rawRole = (await oauthSignupRole()) || user.role || 'CUSTOMER'
          const role = toUserRole(rawRole)

          if (!role || role === 'ADMIN') {
            throw new Error('Invalid role for signup')
          }

          if (!isPublicRole(role)) {
            throw new Error('Role is not allowed for public signup')
          }

          const looksLikeSocial =
            user.emailVerified === true || Boolean(user.image)
          if (looksLikeSocial && !isSocialRole(role)) {
            throw new Error(
              'Google signup is only available for customer and company',
            )
          }

          const roleKey = String(role).toLowerCase()
          const status = looksLikeSocial
            ? 'ACTIVE'
            : defaultStatusForRole(role)

          // Set emailVerified on create so we can skip a post-signup UPDATE
          const emailVerified = looksLikeSocial
            ? true
            : !requiresEmailOtp(roleKey)

          return {
            data: {
              ...user,
              role,
              status,
              emailVerified,
            },
          }
        },
      },
    },
  },
})

export default auth
