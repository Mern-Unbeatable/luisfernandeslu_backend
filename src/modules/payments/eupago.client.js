/**
 * EuPago Split Payments client
 * Docs: POST /v1/split-payments/{payment-method}
 *
 * PAYMENT_PROVIDER=mock  → no EuPago calls (local/dev)
 * PAYMENT_PROVIDER=eupago → real split payments (needs Construpreço API key + seller externKeys)
 */

import { env } from '../../config/env.js'
import { moneyNonNegative as money } from '../../shared/money.js'
import prisma from '../../../lib/prisma.js'
import { httpError } from '../../shared/errors.js'

/** Placeholder for the ADMIN split row when payments are mocked. */
export const MERCHANT_SPLIT_KEY = 'MERCHANT'

export function getPaymentProvider() {
  return env.payments.provider === 'eupago' ? 'eupago' : 'mock'
}

export function isMockPayments() {
  return getPaymentProvider() === 'mock'
}

/** Env fallback only. Prefer `resolveEupagoApiKey()` at payment time. */
export function getEupagoApiKeyFromEnv() {
  return env.payments.eupago.apiKey || ''
}

/** Value saved from the admin dashboard by whichever admin updated it last. */
async function latestAdminProfileValue(field) {
  try {
    const row = await prisma.businessProfile.findFirst({
      where: { user: { role: 'ADMIN' }, [field]: { not: '' } },
      orderBy: { updatedAt: 'desc' },
      select: { [field]: true },
    })
    return String(row?.[field] || '').trim()
  } catch {
    return ''
  }
}

/** Admin dashboard API key (stored in admin `ibanNumber`) first, then env. */
export async function resolveEupagoApiKey() {
  return (await latestAdminProfileValue('ibanNumber')) || getEupagoApiKeyFromEnv()
}

/**
 * Construpreço's own beneficiary key. EuPago never routes the remainder to the
 * merchant, so the commission must be sent as an explicit beneficiary.
 * Admin dashboard first, then env.
 */
export async function resolveAdminExternKey() {
  return (
    (await latestAdminProfileValue('eupagoExternKey')) ||
    env.payments.eupago.adminExternKey ||
    ''
  )
}

/** Split row key for Construpreço's commission; throws when EuPago is live and no key is set. */
export async function getAdminSplitExternKey() {
  if (isMockPayments()) return MERCHANT_SPLIT_KEY
  const key = await resolveAdminExternKey()
  if (!key) {
    throw httpError(
      'Payments are temporarily unavailable. Construpreço EuPago extern key is not configured.',
      503,
      'EupagoAdminExternKeyMissing',
    )
  }
  return key
}

/** Beneficiaries for EuPago: every split with a positive amount, Construpreço included. */
export function toEupagoBeneficiaries(splits, identifierPrefix) {
  return (splits || [])
    .filter((s) => money(s.amount) > 0)
    .map((s) => ({
      externKey: s.externKey,
      amount: s.amount,
      identifier: `${identifierPrefix}-${s.identifier}`,
      immediatePayment: false,
    }))
}

export function getCommissionPercent() {
  const n = env.payments.adminCommissionPercent
  if (!Number.isFinite(n) || n < 0 || n > 100) return 20
  return n
}

/**
 * Per-seller commission set by admin (stored in `user.vatRate`),
 * falling back to the platform default.
 */
export function commissionPercentOf(party) {
  const custom = Number(party?.vatRate)
  if (Number.isFinite(custom) && custom > 0 && custom <= 100) return money(custom)
  return money(getCommissionPercent())
}

export function createMockSplitPayment({ amount, identifier, paymentMethod }) {
  const ref = `MOCK${Date.now().toString().slice(-9)}`
  const method = String(paymentMethod || 'multibanco').toLowerCase()
  const result = {
    transactionStatus: 'Success',
    entity: '00000',
    reference: ref,
    amount: String(money(amount)),
    raw: {
      transactionStatus: 'Success',
      entity: '00000',
      reference: ref,
      amount: String(money(amount)),
      provider: 'mock',
      identifier,
    },
  }

  if (method === 'creditcard') {
    result.url = `http://localhost:8080/api/checkout/webhook/eupago?mock=1&identifier=${identifier}`
    result.raw.redirectUrl = result.url
  }

  return result
}

export async function createSplitPayment({
  paymentMethod,
  amount,
  identifier,
  beneficiaries,
  alias,
  adminCallback,
  successUrl,
  cancelUrl,
}) {
  if (isMockPayments()) {
    return createMockSplitPayment({ amount, identifier, paymentMethod })
  }

  const apiKey = await resolveEupagoApiKey()
  if (!apiKey) {
    const err = new Error('EuPago API key is not configured')
    err.code = 'EupagoNotConfigured'
    err.statusCode = 503
    throw err
  }

  const base = env.payments.eupago.baseUrl
  const method = String(paymentMethod || 'multibanco').toLowerCase()
  const url = `${base}/v1/split-payments/${method}`

  const body = {
    amount: money(amount),
    identifier: String(identifier),
    lang: env.payments.eupago.lang,
    beneficiaries: (beneficiaries || []).map((b) => ({
      externKey: b.externKey,
      amount: money(b.amount),
      identifier: b.identifier || identifier,
      immediatePayment: b.immediatePayment === true,
    })),
  }

  if (adminCallback) body.adminCallback = adminCallback
  if (method === 'mbway' && alias) body.alias = String(alias)
  
  if (method === 'creditcard') {
    // EuPago requires a public (usually HTTPS) URL; localhost is rejected with "URL_INVALID".
    const success = successUrl || env.frontendUrl
    const cancel = cancelUrl || success

    body.successUrl = success
    body.cancelUrl = cancel
    body.failUrl = cancel
    body.backUrl = cancel
    body.returnUrl = success
    body.url = success
    body.success_url = success
    body.cancel_url = cancel
    body.return_url = success
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `ApiKey ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  let data = null
  try {
    data = await res.json()
    console.log('--- EUPAGO RESPONSE ---', JSON.stringify(data, null, 2))
  } catch {
    data = null
  }

  const status = String(data?.transactionStatus || '').toLowerCase()
  if (!res.ok || (status && status !== 'success')) {
    const err = new Error(
      data?.text || data?.message || 'EuPago split payment failed',
    )
    err.code = data?.code || 'EupagoRejected'
    err.statusCode = 502
    err.details = data
    throw err
  }

  return {
    transactionStatus: data.transactionStatus,
    entity: data.entity ?? null,
    reference: data.reference ?? null,
    amount: data.amount != null ? String(data.amount) : String(money(amount)),
    url: data.url ?? data.paymentUrl ?? data.redirectUrl ?? null,
    raw: data,
  }
}

export default {
  createSplitPayment,
  createMockSplitPayment,
  resolveEupagoApiKey,
  resolveAdminExternKey,
  getAdminSplitExternKey,
  toEupagoBeneficiaries,
  getCommissionPercent,
  commissionPercentOf,
  getPaymentProvider,
  isMockPayments,
}
