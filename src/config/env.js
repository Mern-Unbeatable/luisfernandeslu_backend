import 'dotenv/config'

function str(name, fallback = '') {
  const value = process.env[name]
  return value == null || value === '' ? fallback : String(value)
}

function num(name, fallback) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) ? parsed : fallback
}

function bool(name, fallback = false) {
  const value = process.env[name]
  if (value == null || value === '') return fallback
  return String(value).toLowerCase() === 'true'
}

function trimTrailingSlash(url) {
  return url.replace(/\/+$/, '')
}

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  port: num('PORT', 8080),

  frontendUrl: trimTrailingSlash(str('FRONTEND_URL', 'http://localhost:5173')),
  apiUrl: trimTrailingSlash(str('BETTER_AUTH_URL', 'http://localhost:8080')),

  currency: str('CART_CURRENCY', 'EUR'),
  shippingFee: num('CART_SHIPPING_FEE', 20),
  vatFixed: num('CART_VAT_FIXED', 4),
  auctionDurationMinutes: Math.max(1, num('AUCTION_DURATION_MINUTES', 2)),
  auctionEndedVisibleMinutes: Math.max(1, num('AUCTION_ENDED_VISIBLE_MINUTES', 5)),

  jwt: {
    secret: str('JWT_SECRET') || str('BETTER_AUTH_SECRET'),
    expiresIn: str('JWT_EXPIRES_IN', '7d'),
    resetExpiresIn: str('JWT_RESET_EXPIRES_IN', '10m'),
  },

  payments: {
    provider: str('PAYMENT_PROVIDER', 'mock').toLowerCase(),
    adminCommissionPercent: num('ADMIN_COMMISSION_PERCENT', 20),
    eupago: {
      apiKey: str('EUPAGO_API_KEY'),
      adminExternKey: str('EUPAGO_ADMIN_EXTERN_KEY'),
      baseUrl: trimTrailingSlash(
        str('EUPAGO_BASE_URL', 'https://sandbox.eupago.pt/api'),
      ),
      lang: str('EUPAGO_LANG', 'PT'),
      callbackUrl: str('EUPAGO_CALLBACK_URL'),
      webhookSecret: str('EUPAGO_WEBHOOK_SECRET'),
    },
  },

  smtp: {
    host: str('SMTP_HOST'),
    user: str('SMTP_USER'),
    // Gmail app passwords are often pasted with spaces
    pass: str('SMTP_PASS').replace(/\s+/g, ''),
    port: num('SMTP_PORT', 587),
    secure: bool('SMTP_SECURE', false),
    from: str('SMTP_FROM') || str('SMTP_USER') || 'no-reply@construpreco.local',
  },

  otp: {
    secret: str('BETTER_AUTH_SECRET', 'otp-dev-secret'),
  },

  ai: {
    openRouter: {
      apiKey: str('OPENROUTER_API_KEY'),
      model: str('OPENROUTER_MODEL', 'meta-llama/llama-3.2-3b-instruct:free'),
    },
    openAi: {
      apiKey: str('OPENAI_API_KEY'),
      model: str('OPENAI_MODEL', 'gpt-4o-mini'),
    },
  },

  betterAuth: {
    secret: str('BETTER_AUTH_SECRET'),
    google: {
      clientId: str('GOOGLE_CLIENT_ID'),
      clientSecret: str('GOOGLE_CLIENT_SECRET'),
    },
    facebook: {
      clientId: str('FACEBOOK_CLIENT_ID'),
      clientSecret: str('FACEBOOK_CLIENT_SECRET'),
    },
  },
}

export const isProduction = env.nodeEnv === 'production'
export const isDevelopment = env.nodeEnv === 'development'

/**
 * Fails fast at boot when required configuration is missing, so a
 * misconfigured deploy surfaces immediately instead of on first request.
 */
export function assertEnv() {
  const missing = []
  if (!env.jwt.secret) missing.push('JWT_SECRET (or BETTER_AUTH_SECRET)')
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL')

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

export default env
