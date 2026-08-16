/**
 * EuPago Split Payments client
 * Docs: POST /v1/split-payments/{payment-method}
 *
 * PAYMENT_PROVIDER=mock  → no EuPago calls (local/dev)
 * PAYMENT_PROVIDER=eupago → real split payments (needs API key + externKeys)
 */

const DEFAULT_BASE = 'https://sandbox.eupago.pt/api'

function money(n) {
  return Number(Number(Math.max(0, n)).toFixed(2))
}

export function getPaymentProvider() {
  const raw = String(process.env.PAYMENT_PROVIDER || 'mock')
    .trim()
    .toLowerCase()
  return raw === 'eupago' ? 'eupago' : 'mock'
}

export function isMockPayments() {
  return getPaymentProvider() === 'mock'
}

export function getAdminExternKey() {
  const key = String(process.env.EUPAGO_ADMIN_EXTERN_KEY || '').trim()
  if (key) return key
  if (isMockPayments()) return 'MOCK-ADMIN'
  return ''
}

export function getCommissionPercent() {
  const n = Number(process.env.ADMIN_COMMISSION_PERCENT ?? 20)
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

  const apiKey = String(process.env.EUPAGO_API_KEY || '').trim()
  if (!apiKey) {
    const err = new Error('EuPago API key is not configured')
    err.code = 'EupagoNotConfigured'
    err.statusCode = 503
    throw err
  }

  const base = String(process.env.EUPAGO_BASE_URL || DEFAULT_BASE).replace(
    /\/$/,
    '',
  )
  const method = String(paymentMethod || 'multibanco').toLowerCase()
  const url = `${base}/v1/split-payments/${method}`

  const body = {
    amount: money(amount),
    identifier: String(identifier),
    lang: process.env.EUPAGO_LANG || 'PT',
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
