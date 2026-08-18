/**
 * EuPago Split Payments client
 * Docs: POST /v1/split-payments/{payment-method}
 *
 * PAYMENT_PROVIDER=mock  → no EuPago calls (local/dev)
 * PAYMENT_PROVIDER=eupago → real split payments (needs API key + externKeys)
 */

import { env } from '../../config/env.js'
import { moneyNonNegative as money } from '../../shared/money.js'

export function getPaymentProvider() {
  return env.payments.provider === 'eupago' ? 'eupago' : 'mock'
}

export function isMockPayments() {
  return getPaymentProvider() === 'mock'
}

export function getAdminExternKey() {
  const key = env.payments.eupago.adminExternKey
  if (key) return key
  if (isMockPayments()) return 'MOCK-ADMIN'
  return ''
}

export function getCommissionPercent() {
  const n = env.payments.adminCommissionPercent
  if (!Number.isFinite(n) || n < 0 || n > 100) return 20
  return n
}

export function createMockSplitPayment({ amount, identifier }) {
  const ref = `MOCK${Date.now().toString().slice(-9)}`
  return {
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
    return createMockSplitPayment({ amount, identifier })
  }

  const apiKey = env.payments.eupago.apiKey
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
    raw: data,
  }
}

export default {
  createSplitPayment,
  createMockSplitPayment,
  getAdminExternKey,
  getCommissionPercent,
  getPaymentProvider,
  isMockPayments,
}
