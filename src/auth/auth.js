import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import prisma from '../../lib/prisma.js'
import {
  defaultStatusForRole,
  isPublicRole,
  isSocialRole,
  requiresEmailOtp,
  toUserRole,
} from './roles.js'

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:8080'

const socialProviders = {}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }
}

if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
  socialProviders.facebook = {
    clientId: process.env.FACEBOOK_CLIENT_ID,
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
  }
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [frontendUrl],
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
          const rawRole = user.role || 'CUSTOMER'
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
              'Google/Facebook signup is only available for customer and company',
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
