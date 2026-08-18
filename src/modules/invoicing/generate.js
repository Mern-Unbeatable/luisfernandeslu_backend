import prisma from '../../../lib/prisma.js'
import { absolutizeUrl } from '../../lib/requestUrl.js'
import { httpError } from '../../shared/errors.js'
import { buildSupplierInvoicePdf } from '../../shared/pdf/invoice-pdf.js'
import { buildInvoicePayload } from './payload.js'
import { ensureInvoice, writeInvoicePdf } from './pdf-store.js'

export const invoiceOrderInclude = {
  customer: {
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      role: true,
      profile: { select: { companyName: true } },
    },
  },
  seller: {
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      profile: { select: { companyName: true, nifNumber: true } },
      addresses: {
        where: { addressType: 'WAREHOUSE', isDefault: true },
        take: 1,
        include: { address: true },
      },
    },
  },
  shippingAddress: true,
  checkoutSession: {
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      paymentMethod: true,
      paymentStatus: true,
    },
  },
  orderLineItems: {
    include: { product: { select: { id: true, title: true, sku: true } } },
  },
  paymentPlan: {
    include: {
      installments: {
        orderBy: { installmentNumber: 'asc' },
        select: {
          installmentNumber: true,
          amount: true,
          dueDate: true,
          status: true,
        },
      },
    },
  },
  invoices: true,
}

export async function renderInvoicePdf(order, invoice, payloadOptions, storeOptions) {
  const buffer = await buildSupplierInvoicePdf(
    buildInvoicePayload(order, invoice, payloadOptions),
  )
  return writeInvoicePdf({ ...storeOptions, invoice, buffer })
}

/**
 * Supplier copy from an order-detail "Download invoice" action.
 * Requires the order to already be accepted (not NEW).
 */
export async function downloadSupplierOrderInvoice({
  sellerId,
  where,
  baseUrl,
  payloadOptions = {},
}) {
  const order = await prisma.order.findFirst({
    where,
    include: {
      ...invoiceOrderInclude,
      invoices: { where: { audience: 'SUPPLIER' }, take: 1 },
    },
  })
  if (!order) throw httpError('Order not found', 404, 'NotFound')
  if (order.orderStatus === 'NEW') {
    throw httpError(
      'Accept the order before downloading invoice',
      400,
      'InvoiceNotReady',
    )
  }

  const invoice = await ensureInvoice(order, 'SUPPLIER')
  const file = await renderInvoicePdf(
    order,
    invoice,
    { showShippingVat: false, ...payloadOptions },
    { sellerId },
  )
  const issueDate = invoice.issueDate || new Date()

  return {
    status: 200,
    file: {
      buffer: file.buffer,
      filename: file.filename,
      contentType: 'application/pdf',
    },
    body: {
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        pdfUrl: absolutizeUrl(file.publicPath, baseUrl),
        issueDate,
      },
      message: 'Invoice ready',
    },
  }
}

/** Fiscal document pair: supplier copy (no shipping/VAT) + buyer copy (with). */
export async function generateFiscalDocuments(order, sellerId) {
  const supplierInvoice = await ensureInvoice(order, 'SUPPLIER', {
    prefix: 'DOC',
    audience: 'SUPPLIER',
  })
  const buyerInvoice = await ensureInvoice(order, 'CUSTOMER', {
    prefix: 'INV',
    audience: 'CUSTOMER',
  })

  const supplierFile = await renderInvoicePdf(
    order,
    supplierInvoice,
    { showShippingVat: false, includeInstallments: true, totalMode: 'net' },
    { sellerId, subdir: 'supplier' },
  )
  const buyerFile = await renderInvoicePdf(
    order,
    buyerInvoice,
    { showShippingVat: true, includeInstallments: true, totalMode: 'grand' },
    { sellerId, subdir: 'buyer' },
  )

  return {
    supplierInvoice: { ...supplierInvoice, pdfUrl: supplierFile.publicPath },
    buyerInvoice: { ...buyerInvoice, pdfUrl: buyerFile.publicPath },
    supplierFile,
    buyerFile,
  }
}
