import fs from 'node:fs'
import path from 'node:path'
import prisma from '../../../lib/prisma.js'
import { UPLOAD_ROOT } from '../../shared/storage.js'
import { invoiceNumber } from '../../shared/numbering.js'

export async function ensureInvoice(order, audience, numbering = {}) {
  const existing = (order.invoices || []).find((i) => i.audience === audience)
  if (existing) return existing
  return prisma.invoice.create({
    data: {
      orderId: order.id,
      audience,
      invoiceNumber: invoiceNumber(order.orderNumber, numbering),
    },
  })
}

/**
 * Persist a generated PDF. `subdir` is `buyer` / `supplier` for fiscal
 * documents, omitted for the supplier order-detail invoice.
 */
export async function writeInvoicePdf({ sellerId, invoice, buffer, subdir }) {
  const dir = subdir
    ? path.join(UPLOAD_ROOT, 'invoices', sellerId, subdir)
    : path.join(UPLOAD_ROOT, 'invoices', sellerId)
  fs.mkdirSync(dir, { recursive: true })
  const filename = `${invoice.invoiceNumber}.pdf`.replace(/[^\w.-]/g, '_')
  fs.writeFileSync(path.join(dir, filename), buffer)
  const publicPath = subdir
    ? `/uploads/invoices/${sellerId}/${subdir}/${filename}`
    : `/uploads/invoices/${sellerId}/${filename}`
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { pdfUrl: publicPath },
  })
  return { publicPath, filename, buffer }
}
