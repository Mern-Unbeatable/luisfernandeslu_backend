import prisma from '../../../lib/prisma.js'
import { saveUploadBuffer } from '../../shared/storage.js'
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
  const filename = `${invoice.invoiceNumber}.pdf`.replace(/[^\w.-]/g, '_')
  const key = subdir
    ? `invoices/${sellerId}/${subdir}/${filename}`
    : `invoices/${sellerId}/${filename}`
  await saveUploadBuffer(key, buffer, 'application/pdf')
  const publicPath = `/uploads/${key}`
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { pdfUrl: publicPath },
  })
  return { publicPath, filename, buffer }
}
