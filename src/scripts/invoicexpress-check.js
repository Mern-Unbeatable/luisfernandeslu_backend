/**
 * InvoiceXpress connection check.
 *
 *   npm run invoicexpress:check                  → verify key + list taxes (read-only)
 *   npm run invoicexpress:check -- ORD-123       → issue that order's invoice now
 *                                                  (draft unless INVOICEXPRESS_FINALIZE=true)
 */
import prisma from '../../lib/prisma.js'
import { env } from '../config/env.js'
import { resolveVatRate } from '../modules/admin/settings/settings.store.js'
import { isInvoiceXpressConfigured, listTaxes } from '../modules/invoicing/invoicexpress.client.js'
import { issueTaxInvoiceForOrder, mapTaxInvoice } from '../modules/invoicing/tax-invoice.service.js'

const cfg = env.invoicing.invoicexpress
const orderRef = process.argv[2]

async function main() {
  if (!isInvoiceXpressConfigured()) {
    console.error('Set INVOICEXPRESS_ACCOUNT_NAME and INVOICEXPRESS_API_KEY in .env first.')
    process.exitCode = 1
    return
  }

  console.log(`Account:       ${cfg.accountName}`)
  console.log(`Document type: ${cfg.documentType}`)
  console.log(`Mode:          ${cfg.finalize ? 'FINALIZE (reported to AT)' : 'DRAFT only (nothing reaches AT)'}`)

  const taxes = await listTaxes({ fresh: true })
  console.log(`\nConnection OK. Taxes in InvoiceXpress (${taxes.length}):`)
  for (const t of taxes) {
    console.log(`  ${t.name.padEnd(10)} ${String(t.value).padStart(5)}%  ${t.region}${t.defaultTax ? '  (default)' : ''}`)
  }

  const rate = await resolveVatRate(null)
  const match = taxes.find((t) => Math.abs(t.value - rate) < 0.01)
  console.log(
    `\nAdmin default VAT rate: ${rate}% → ${match ? `uses ${match.name}` : 'no matching tax yet (created automatically on first invoice)'}`,
  )

  if (!orderRef) return

  const order = await prisma.order.findFirst({
    where: { OR: [{ id: orderRef }, { orderNumber: orderRef }] },
    select: { id: true, orderNumber: true, grandTotal: true },
  })
  if (!order) {
    console.error(`\nOrder ${orderRef} not found.`)
    process.exitCode = 1
    return
  }
  console.log(`\nIssuing invoice for ${order.orderNumber} (order total €${order.grandTotal})...`)
  const row = await issueTaxInvoiceForOrder(order.id)
  console.log(mapTaxInvoice(row))
}

main()
  .catch((err) => {
    console.error(err.message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
