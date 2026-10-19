/**
 * One certified InvoiceXpress invoice per paid order.
 *
 * Lines mirror what the buyer paid: products at the order's VAT rate, plus
 * shipping as a VAT-inclusive line so the invoice total equals `grandTotal`.
 * With INVOICEXPRESS_FINALIZE=false documents stay as drafts (never reach AT).
 */
import prisma from '../../../lib/prisma.js'
import { env } from '../../config/env.js'
import { httpError } from '../../shared/errors.js'
import ix, { isInvoiceXpressConfigured } from './invoicexpress.client.js'

const inFlight = new Set()

const orderInclude = {
  customer: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      profile: { select: { companyName: true, nifNumber: true } },
    },
  },
  billingAddress: true,
  checkoutSession: {
    select: { firstName: true, lastName: true, email: true, paymentStatus: true },
  },
  orderLineItems: {
    include: { product: { select: { id: true, title: true, sku: true } } },
  },
  taxInvoice: true,
}

function round(n, places) {
  const f = 10 ** places
  return Math.round((Number(n) || 0) * f) / f
}

/** VAT rate the order was charged with (stored amounts only keep the VAT total). */
export function orderVatRate(order) {
  const base = Number(order.subTotal) || 0
  if (base <= 0) return 0
  const raw = (Number(order.vatAmount) / base) * 100
  const nearest = Math.round(raw)
  return Math.abs(raw - nearest) < 0.05 ? nearest : round(raw, 2)
}

function lisbonDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
  return parts
}

function clientCountry(country) {
  const value = String(country || '').trim()
  if (!value || /portugal/i.test(value)) return 'Portugal'
  return value
}

const RESERVED_EMAIL_TLDS = new Set(['local', 'localhost', 'test', 'example', 'invalid', 'internal'])

/** InvoiceXpress rejects the whole document (422) on an email it can't parse; the field is optional. */
export function invoiceEmail(...candidates) {
  for (const candidate of candidates) {
    const email = String(candidate || '').trim().toLowerCase()
    const match = /^[^\s@]+@[^\s@]+\.([a-z]{2,24})$/.exec(email)
    if (match && !RESERVED_EMAIL_TLDS.has(match[1])) return email
  }
  return undefined
}

function buildClient(order) {
  const { customer, billingAddress: addr, checkoutSession: session } = order
  const company = customer.role === 'COMPANY' ? customer.profile?.companyName?.trim() : ''
  const person = [session?.firstName, session?.lastName].filter(Boolean).join(' ').trim()
  const nif = String(customer.profile?.nifNumber || '').replace(/\D/g, '')

  return {
    name: company || person || customer.name || customer.email,
    code: customer.id,
    email: invoiceEmail(session?.email, customer.email),
    address: addr?.streetAddress || undefined,
    city: addr?.city || undefined,
    postal_code: addr?.zipCode || undefined,
    country: clientCountry(addr?.country),
    ...(nif.length === 9 ? { fiscal_id: nif } : {}),
  }
}

function buildItems(order, taxName, rate) {
  const items = order.orderLineItems.map((line) => {
    const quantity = Math.max(1, Number(line.quantity) || 1)
    return {
      name: line.product?.sku || `P-${line.productId.slice(0, 8)}`,
      description: line.product?.title || 'Product',
      unit_price: round(Number(line.totalPriceLocked) / quantity, 4),
      quantity,
      tax: { name: taxName },
    }
  })

  const shipping = Number(order.shippingFee) || 0
  if (shipping > 0) {
    items.push({
      name: 'SHIPPING',
      description: 'Transporte / Shipping',
      unit_price: round(shipping / (1 + rate / 100), 4),
      quantity: 1,
      tax: { name: taxName },
    })
  }
  return items
}

async function saveState(orderId, data) {
  return prisma.taxInvoice.update({ where: { orderId }, data })
}

/** Drafts come back with placeholders ("rascunho", "N/A") instead of a number / ATCUD. */
function docFields(doc) {
  const draft = String(doc.status || '').toLowerCase() === 'draft'
  const number = doc.inverted_sequence_number || doc.sequence_number
  const atcud = String(doc.atcud || '').trim()
  return {
    externalId: String(doc.id),
    sequenceNumber: !draft && number && !/rascunho|draft/i.test(number) ? number : null,
    atcud: !draft && atcud && atcud.toUpperCase() !== 'N/A' ? atcud : null,
    permalink: doc.permalink || null,
    total: Number.isFinite(Number(doc.total)) ? Number(doc.total) : null,
  }
}

async function finalizeAndNotify(order, row) {
  const cfg = env.invoicing.invoicexpress
  const docType = row.documentType || cfg.documentType
  const doc = await ix.finalizeDocument(docType, row.externalId)
  const saved = await saveState(order.id, {
    ...(doc ? docFields(doc) : {}),
    status: 'FINALIZED',
    finalizedAt: new Date(),
    error: null,
  })

  const email = invoiceEmail(order.checkoutSession?.email, order.customer.email)
  if (cfg.sendEmail && email) {
    try {
      await ix.emailDocument(docType, row.externalId, {
        email,
        subject: `Fatura ${saved.sequenceNumber || ''} — Construpreço`.trim(),
        body: `Segue em anexo a fatura da sua encomenda ${order.orderNumber}. Obrigado pela sua compra.`,
      })
    } catch (err) {
      console.warn(`[tax-invoice] email failed for ${order.orderNumber}: ${err.message}`)
    }
  }
  return saved
}

async function issue(orderId, { requirePaid }) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude })
  if (!order) throw httpError('Order not found', 404, 'NotFound')
  if (requirePaid && order.checkoutSession?.paymentStatus !== 'PAID') {
    throw httpError('Order is not paid yet', 409, 'OrderNotPaid')
  }

  const cfg = env.invoicing.invoicexpress
  let row =
    order.taxInvoice ||
    (await prisma.taxInvoice.upsert({
      where: { orderId },
      create: { orderId, documentType: cfg.documentType },
      update: {},
    }))

  if (row.status === 'FINALIZED') return row

  await saveState(orderId, { attempts: { increment: 1 } })

  try {
    if (!row.externalId) {
      const rate = orderVatRate(order)
      if (rate === 0 && !cfg.taxExemptionCode) {
        throw httpError(
          'Order has 0% VAT — set INVOICEXPRESS_TAX_EXEMPTION_CODE (e.g. M07) to issue it.',
          422,
          'TaxExemptionRequired',
        )
      }
      const taxName = await ix.resolveTaxName(rate)
      const today = lisbonDate()
      const doc = await ix.createDocument(
        row.documentType || cfg.documentType,
        {
          date: today,
          due_date: today,
          reference: order.orderNumber,
          observations: `Construpreço — encomenda ${order.orderNumber}`,
          ...(rate === 0 ? { tax_exemption: cfg.taxExemptionCode } : {}),
          client: buildClient(order),
          items: buildItems(order, taxName, rate),
        },
        `order-${order.id}`,
      )
      row = await saveState(orderId, {
        ...docFields(doc),
        vatRate: rate,
        status: 'DRAFT',
        error: null,
      })

      const expected = round(order.grandTotal, 2)
      if (row.total != null && Math.abs(row.total - expected) > 0.02) {
        console.warn(
          `[tax-invoice] ${order.orderNumber}: InvoiceXpress total ${row.total} ≠ order total ${expected}`,
        )
      }
    }

    if (cfg.finalize) {
      row = await finalizeAndNotify(order, row)
    }
    return row
  } catch (err) {
    await saveState(orderId, {
      status: row.externalId ? 'DRAFT' : 'FAILED',
      error: String(err.message || err).slice(0, 1000),
    })
    throw err
  }
}

/** Issue (or finalize) the InvoiceXpress invoice for one order. Idempotent. */
export async function issueTaxInvoiceForOrder(orderId, { requirePaid = true } = {}) {
  if (!isInvoiceXpressConfigured()) {
    throw httpError(
      'InvoiceXpress is not configured (INVOICEXPRESS_ACCOUNT_NAME / INVOICEXPRESS_API_KEY).',
      503,
      'InvoiceXpressNotConfigured',
    )
  }
  if (inFlight.has(orderId)) {
    throw httpError('Invoice is already being issued for this order', 409, 'InvoiceInProgress')
  }
  inFlight.add(orderId)
  try {
    return await issue(orderId, { requirePaid })
  } finally {
    inFlight.delete(orderId)
  }
}

/**
 * Fire-and-forget after a checkout is paid: never throws, failures are kept
 * on the TaxInvoice row so admin can retry.
 */
export async function issueTaxInvoicesForCheckout(checkoutSessionId) {
  if (!isInvoiceXpressConfigured()) return
  try {
    const orders = await prisma.order.findMany({
      where: { checkoutSessionId },
      select: { id: true, orderNumber: true },
    })
    for (const order of orders) {
      try {
        await issueTaxInvoiceForOrder(order.id)
      } catch (err) {
        console.error(`[tax-invoice] ${order.orderNumber}: ${err.message}`)
      }
    }
  } catch (err) {
    console.error(`[tax-invoice] checkout ${checkoutSessionId}: ${err.message}`)
  }
}

export function mapTaxInvoice(row) {
  if (!row) return null
  return {
    status: row.status,
    number: row.sequenceNumber,
    atcud: row.atcud,
    url: row.status === 'FINALIZED' ? row.permalink : null,
    vatRate: row.vatRate,
    total: row.total,
    error: row.error,
    attempts: row.attempts,
    finalizedAt: row.finalizedAt,
  }
}

export default { issueTaxInvoiceForOrder, issueTaxInvoicesForCheckout, mapTaxInvoice, orderVatRate }
