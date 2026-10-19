/**
 * InvoiceXpress API v2 — https://docs.invoicexpress.com/
 * Auth is the `api_key` query param on https://ACCOUNT_NAME.app.invoicexpress.com.
 */
import { env } from '../../config/env.js'
import { httpError } from '../../shared/errors.js'

const TAX_CACHE_MS = 10 * 60 * 1000
let taxCache = null

function config() {
  return env.invoicing.invoicexpress
}

export function isInvoiceXpressConfigured() {
  const { accountName, apiKey } = config()
  return Boolean(accountName && apiKey)
}

function baseUrl() {
  return `https://${encodeURIComponent(config().accountName)}.app.invoicexpress.com`
}

async function request(method, path, body) {
  if (!isInvoiceXpressConfigured()) {
    throw httpError(
      'InvoiceXpress is not configured (INVOICEXPRESS_ACCOUNT_NAME / INVOICEXPRESS_API_KEY).',
      503,
      'InvoiceXpressNotConfigured',
    )
  }
  const url = new URL(path, baseUrl())
  url.searchParams.set('api_key', config().apiKey)

  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text().catch(() => '')
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (res.status === 401) {
    throw httpError(
      'InvoiceXpress rejected the credentials — check INVOICEXPRESS_ACCOUNT_NAME and INVOICEXPRESS_API_KEY.',
      502,
      'InvoiceXpressUnauthorized',
    )
  }
  if (!res.ok) {
    const detail = data?.errors
      ? JSON.stringify(data.errors)
      : text.slice(0, 300) || res.statusText
    throw httpError(
      `InvoiceXpress ${method} ${path} failed (${res.status}): ${detail}`,
      res.status >= 500 ? 502 : 422,
      'InvoiceXpressError',
      { status: res.status },
    )
  }
  return { status: res.status, data }
}

/** First object value of a response like `{ invoice_receipt: {...} }`. */
function documentOf(data) {
  if (!data || typeof data !== 'object') return null
  return (
    data.invoice_receipt ||
    data.invoice ||
    data.simplified_invoice ||
    Object.values(data).find((v) => v && typeof v === 'object' && 'id' in v) ||
    null
  )
}

export async function listTaxes({ fresh = false } = {}) {
  if (!fresh && taxCache && Date.now() - taxCache.at < TAX_CACHE_MS) {
    return taxCache.taxes
  }
  const { data } = await request('GET', '/taxes.json')
  const taxes = (data?.taxes || []).map((t) => ({
    id: t.id,
    name: String(t.name || ''),
    value: Number(t.value),
    region: String(t.region || ''),
    defaultTax: Boolean(Number(t.default_tax)),
  }))
  taxCache = { at: Date.now(), taxes }
  return taxes
}

function findTax(taxes, rate) {
  const matches = taxes.filter((t) => Math.abs(t.value - rate) < 0.01)
  return matches.find((t) => t.region === 'PT') || matches[0] || null
}

/**
 * Tax name (e.g. "IVA23") whose value equals `rate`; created in the account
 * when missing so the invoice matches the VAT the buyer paid.
 */
export async function resolveTaxName(rate) {
  const existing = findTax(await listTaxes(), rate)
  if (existing) return existing.name

  const fresh = findTax(await listTaxes({ fresh: true }), rate)
  if (fresh) return fresh.name

  const name = `IVA${String(rate).replace('.', '_')}`
  await request('POST', '/taxes.json', {
    tax: { name, value: rate, region: 'PT', default_tax: 0 },
  })
  taxCache = null
  return name
}

export async function createDocument(documentType, invoice, proprietaryUid) {
  const { data } = await request('POST', `/${documentType}.json`, {
    invoice,
    proprietary_uid: proprietaryUid,
  })
  const doc = documentOf(data)
  if (!doc?.id) {
    throw httpError('InvoiceXpress returned no document id', 502, 'InvoiceXpressError')
  }
  return doc
}

export async function getDocument(documentType, id) {
  const { data } = await request('GET', `/${documentType}/${id}.json`)
  return documentOf(data)
}

export async function finalizeDocument(documentType, id) {
  const { data } = await request('PUT', `/${documentType}/${id}/change-state.json`, {
    invoice: { state: 'finalized' },
  })
  return documentOf(data) || (await getDocument(documentType, id))
}

export async function emailDocument(documentType, id, { email, subject, body }) {
  await request('PUT', `/${documentType}/${id}/email-document.json`, {
    message: {
      client: { email, save: '0' },
      subject,
      body,
    },
  })
}

export default {
  isInvoiceXpressConfigured,
  listTaxes,
  resolveTaxName,
  createDocument,
  getDocument,
  finalizeDocument,
  emailDocument,
}
