import 'dotenv/config'
import { CURRENCY } from '../shared/money.js'

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
  /** Extra allowed browser origins (comma-separated), e.g. staging frontend. */
  frontendUrlExtra: str('FRONTEND_URL_EXTRA', ''),
  apiUrl: trimTrailingSlash(str('BETTER_AUTH_URL', 'http://localhost:8080')),

  currency: CURRENCY,
  /**
   * Legacy unused by cart/checkout. Shipping = distance × admin vehicleRates.
   * Kept only so old .env keys do not break boot.
   */
  shippingFee: num('CART_SHIPPING_FEE', 0),
  /** Fallback only when buyer has no vatRate and admin settings are unset. */
  vatFixed: num('CART_VAT_FIXED', 4),
  /** Fallback auction duration before admin settings are saved. */
  auctionDurationMinutes: Math.max(1, num('AUCTION_DURATION_MINUTES', 2)),
  auctionEndedVisibleMinutes: Math.max(1, num('AUCTION_ENDED_VISIBLE_MINUTES', 5)),
  /** Fallback per-km rate before admin settings / vehicleRates are saved. */
  transportPricePerKm: num('TRANSPORT_PRICE_PER_KM', 2.5),

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

  invoicing: {
    invoicexpress: {
      accountName: str('INVOICEXPRESS_ACCOUNT_NAME'),
      apiKey: str('INVOICEXPRESS_API_KEY'),
      /** false = drafts only (nothing reaches the Tax Authority). */
      finalize: bool('INVOICEXPRESS_FINALIZE', false),
      /** Email the finalized invoice to the buyer from InvoiceXpress. */
      sendEmail: bool('INVOICEXPRESS_SEND_EMAIL', false),
      documentType: str('INVOICEXPRESS_DOCUMENT_TYPE', 'invoice_receipts'),
      /** AT exemption code for 0% VAT lines (shipping, or orders without VAT). */
      taxExemptionCode: str('INVOICEXPRESS_TAX_EXEMPTION_CODE', 'M99'),
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
    /** Production primary (product USE AI). */
    gemini: {
      apiKey: str('GEMINI_API_KEY'),
      model: str('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
    },
    /** Development primary (free/dev models). */
    openRouter: {
      apiKey: str('OPENROUTER_API_KEY'),
      model: str('OPENROUTER_MODEL', 'meta-llama/llama-3.2-3b-instruct:free'),
    },
    /** Optional fallback. */
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

/** Browser origins allowed for CORS / Better Auth / Socket.IO. */
export function getCorsOrigins() {
  return Array.from(
    new Set(
      [
        env.frontendUrl,
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'https://luisfernandeslu.maktechgroup.tech',
        'https://dev.luisfernandeslu.maktechgroup.tech',
        'https://construpreco.pt',
        'https://www.construpreco.pt',
        env.frontendUrlExtra,
      ]
        .filter(Boolean)
        .flatMap((v) =>
          String(v)
            .split(',')
            .map((s) => trimTrailingSlash(s.trim()))
            .filter(Boolean),
        ),
    ),
  )
}

export default env
