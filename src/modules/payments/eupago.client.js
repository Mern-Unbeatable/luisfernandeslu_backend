/**
 * EuPago Split Payments client
 * Docs: POST /v1/split-payments/{payment-method}
 *
 * PAYMENT_PROVIDER=mock  → no EuPago calls (local/dev)
 * PAYMENT_PROVIDER=eupago → real split payments (needs API key + externKeys)
 */

import { env } from '../../config/env.js'
import { moneyNonNegative as money } from '../../shared/money.js'
import prisma from '../../../lib/prisma.js'

export function getPaymentProvider() {
  return env.payments.provider === 'eupago' ? 'eupago' : 'mock'
}

export function isMockPayments() {
  return getPaymentProvider() === 'mock'
}

/** Env / mock fallback only. Prefer `resolveAdminExternKey()` at payment time. */
export function getAdminExternKey() {
  const key = env.payments.eupago.adminExternKey
  if (key) return key
  if (isMockPayments()) return 'MOCK-ADMIN'
  return ''
}

/** Admin profile `eupagoExternKey` first, then env, then mock. */
export async function resolveAdminExternKey() {
  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      orderBy: { createdAt: 'asc' },
      select: { profile: { select: { eupagoExternKey: true } } },
    })
    const fromProfile = admin?.profile?.eupagoExternKey?.trim()
    if (fromProfile) return fromProfile
  } catch {
    // fall through to env
  }
  return getAdminExternKey()
}

/** Env fallback only. Prefer `resolveEupagoApiKey()` at payment time. */
export function getEupagoApiKeyFromEnv() {
  return env.payments.eupago.apiKey || ''
}

/** Admin profile API key (stored in admin `ibanNumber`) first, then env. */
export async function resolveEupagoApiKey() {
  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      orderBy: { createdAt: 'asc' },
      select: { profile: { select: { ibanNumber: true } } },
    })
    const fromProfile = admin?.profile?.ibanNumber?.trim()
    if (fromProfile) return fromProfile
  } catch {
    // fall through to env
  }
  return getEupagoApiKeyFromEnv()
}

export function getCommissionPercent() {
  const n = env.payments.adminCommissionPercent
  if (!Number.isFinite(n) || n < 0 || n > 100) return 20
  return n
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
    // Eupago requires a valid public URL (usually HTTPS) for credit card transactions.
    // Localhost is often rejected with "URL_INVALID".
    const success = 'https://google.com/success'
    const cancel = 'https://google.com/cancel'
    
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
  getAdminExternKey,
  resolveAdminExternKey,
  resolveEupagoApiKey,
  getCommissionPercent,
  getPaymentProvider,
  isMockPayments,
}
