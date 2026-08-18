import prisma from '../../../../lib/prisma.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { httpError } from '../../../shared/errors.js'
import { money } from '../../../shared/money.js'
import { companyDisplayName } from '../../../shared/party.js'
import { parsePagination, paginationMeta } from '../../../shared/pagination.js'
import { startOfMonth } from '../../../shared/dates.js'
import { CURRENCY } from '../payload.js'
import {
  generateFiscalDocuments,
  invoiceOrderInclude,
} from '../generate.js'

const BUYER_ROLES = ['CUSTOMER', 'COMPANY']

class SupplierDocumentService {
  assertSupplier(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    const role = String(auth.role || '').toLowerCase()
    if (role !== 'supplier') {
      throw httpError('Only suppliers can manage fiscal documents', 403, 'Forbidden')
    }
    return auth.id
  }

  sellerBuyerWhere(sellerId) {
    return {
      sellerId,
      customer: { role: { in: BUYER_ROLES } },
    }
  }

  /** Documents the supplier generated for a customer/company. */
  buyerDocumentWhere(sellerId) {
    return {
      audience: 'CUSTOMER',
      order: this.sellerBuyerWhere(sellerId),
    }
  }

  /** System invoices generated for the supplier (order-detail / auto). */
  systemInvoiceWhere(sellerId) {
    return {
      audience: 'SUPPLIER',
      order: this.sellerBuyerWhere(sellerId),
    }
  }

  async getStats(auth) {
    const sellerId = this.assertSupplier(auth)
    const monthStart = startOfMonth()

    const buyerWhere = this.buyerDocumentWhere(sellerId)
    const systemWhere = this.systemInvoiceWhere(sellerId)

    const [totalDocuments, thisMonth, invoices, valueAgg] = await Promise.all([
      prisma.invoice.count({ where: buyerWhere }),
      prisma.invoice.count({
        where: { ...systemWhere, issueDate: { gte: monthStart } },
      }),
      prisma.invoice.count({ where: systemWhere }),
      prisma.order.aggregate({
        where: {
          ...this.sellerBuyerWhere(sellerId),
          invoices: { some: { audience: 'CUSTOMER' } },
        },
        _sum: { grandTotal: true },
      }),
    ])

    return {
      status: 200,
      body: {
        stats: {
          totalDocuments,
          thisMonth,
          invoices,
          totalValue: money(valueAgg._sum.grandTotal),
          currency: CURRENCY,
        },
        message: 'Fiscal document stats fetched',
      },
    }
  }

  mapDocumentRow(invoice, baseUrl) {
    const order = invoice.order
    const buyerName = companyDisplayName(order?.customer) || order?.customer?.name
    return {
      id: invoice.id,
      documentId: invoice.invoiceNumber,
      type: 'invoice',
      orderId: order?.orderNumber || null,
      orderUuid: order?.id || invoice.orderId,
      buyerType: String(order?.customer?.role || '').toLowerCase() || null,
      customer: buyerName,
      amount: money(order?.grandTotal),
      currency: CURRENCY,
      date: invoice.issueDate,
      pdfUrl: invoice.pdfUrl ? absolutizeUrl(invoice.pdfUrl, baseUrl) : null,
    }
  }

  async list(auth, query, baseUrl) {
    const sellerId = this.assertSupplier(auth)
    const { page, limit, skip } = parsePagination(query)
    const search = String(query.search || '').trim()

    const where = {
      ...this.buyerDocumentWhere(sellerId),
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { invoiceNumber: { contains: search, mode: 'insensitive' } },
            { order: { orderNumber: { contains: search, mode: 'insensitive' } } },
            { order: { customer: { name: { contains: search, mode: 'insensitive' } } } },
            {
              order: {
                customer: {
                  profile: { companyName: { contains: search, mode: 'insensitive' } },
                },
              },
            },
          ],
        },
      ]
    }

    const [total, rows] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy: { issueDate: 'desc' },
        skip,
        take: limit,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              grandTotal: true,
              customer: {
                select: {
                  name: true,
                  role: true,
                  profile: { select: { companyName: true } },
                },
              },
            },
          },
        },
      }),
    ])

    return {
      status: 200,
      body: {
        documents: rows.map((row) => this.mapDocumentRow(row, baseUrl)),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Fiscal documents fetched',
      },
    }
  }

  async listEligibleOrders(auth, query) {
    const sellerId = this.assertSupplier(auth)
    const search = String(query.search || '').trim()
    const limit = Number(query.limit) || 50

    const where = {
      ...this.sellerBuyerWhere(sellerId),
      orderStatus: { not: 'CANCELLED' },
      invoices: { none: { audience: 'CUSTOMER' } },
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { orderNumber: { contains: search, mode: 'insensitive' } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
            {
              customer: {
                profile: { companyName: { contains: search, mode: 'insensitive' } },
              },
            },
          ],
        },
      ]
    }

    const rows = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        grandTotal: true,
        orderStatus: true,
        customer: {
          select: {
            role: true,
            name: true,
            profile: { select: { companyName: true } },
          },
        },
      },
    })

    return {
      status: 200,
      body: {
        orders: rows.map((o) => ({
          id: o.id,
          orderId: o.orderNumber,
          orderNumber: o.orderNumber,
          customer: companyDisplayName(o.customer),
          buyerType: String(o.customer?.role || '').toLowerCase(),
          amount: money(o.grandTotal),
          currency: CURRENCY,
          orderStatus: o.orderStatus,
        })),
        message: 'Eligible orders fetched',
      },
    }
  }

  async loadSellerOrder(sellerId, orderId) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        orderId,
      )

    return prisma.order.findFirst({
      where: {
        ...this.sellerBuyerWhere(sellerId),
        ...(isUuid ? { id: orderId } : { orderNumber: orderId }),
      },
      include: invoiceOrderInclude,
    })
  }

  async generate(auth, body, baseUrl) {
    const sellerId = this.assertSupplier(auth)
    const order = await this.loadSellerOrder(sellerId, body.orderId)
    if (!order) throw httpError('Order not found', 404, 'NotFound')

    if (order.orderStatus === 'CANCELLED') {
      throw httpError(
        'Cannot generate a document for a cancelled order',
        400,
        'OrderNotEligible',
        { orderStatus: order.orderStatus },
      )
    }

    const already = (order.invoices || []).some((i) => i.audience === 'CUSTOMER')
    const files = await generateFiscalDocuments(order, sellerId)

    return {
      status: already ? 200 : 201,
      body: {
        document: {
          id: files.buyerInvoice.id,
          documentId: files.buyerInvoice.invoiceNumber,
          type: 'invoice',
          orderId: order.orderNumber,
          orderUuid: order.id,
          buyerType: String(order.customer?.role || '').toLowerCase(),
          customer: companyDisplayName(order.customer),
          amount: money(order.grandTotal),
          currency: CURRENCY,
          date: files.buyerInvoice.issueDate,
          pdfUrl: absolutizeUrl(files.supplierInvoice.pdfUrl, baseUrl),
          buyerPdfUrl: absolutizeUrl(files.buyerInvoice.pdfUrl, baseUrl),
        },
        message: already
          ? 'Document already existed — PDFs regenerated'
          : 'Document generated',
      },
    }
  }

  async getById(auth, id, baseUrl) {
    const sellerId = this.assertSupplier(auth)
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        audience: 'CUSTOMER',
        order: this.sellerBuyerWhere(sellerId),
      },
      include: {
        order: {
          include: {
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
            shippingAddress: true,
            orderLineItems: {
              include: { product: { select: { title: true, sku: true } } },
            },
            invoices: true,
          },
        },
      },
    })
    if (!invoice) throw httpError('Document not found', 404, 'NotFound')

    const order = invoice.order
    const supplierInvoice = (order.invoices || []).find((i) => i.audience === 'SUPPLIER')
    const netSubtotal = money(order.subTotal)
    const discount = money(order.discountAmount)
    const grossSubtotal = money(netSubtotal + discount)

    return {
      status: 200,
      body: {
        document: {
          id: invoice.id,
          documentId: invoice.invoiceNumber,
          type: 'invoice',
          orderId: order.orderNumber,
          orderUuid: order.id,
          buyerType: String(order.customer?.role || '').toLowerCase(),
          customer: {
            id: order.customer?.id || null,
            name: companyDisplayName(order.customer),
            email: order.customer?.email || null,
            phone: order.customer?.phoneNumber || null,
          },
          date: invoice.issueDate,
          pdfUrl: supplierInvoice?.pdfUrl
            ? absolutizeUrl(supplierInvoice.pdfUrl, baseUrl)
            : null,
          items: order.orderLineItems.map((li) => ({
            title: li.product?.title || 'Product',
            sku: li.product?.sku || null,
            quantity: li.quantity,
            unitPrice: money(li.unitPriceLocked),
            total: money(Number(li.unitPriceLocked || 0) * Number(li.quantity || 0)),
          })),
          totals: {
            subtotal: grossSubtotal,
            discount,
            total: netSubtotal,
            currency: CURRENCY,
          },
        },
        message: 'Document fetched',
      },
    }
  }

  async downloadPdf(auth, id, audienceRaw, baseUrl) {
    const sellerId = this.assertSupplier(auth)
    const audience =
      String(audienceRaw || 'SUPPLIER').toUpperCase() === 'CUSTOMER'
        ? 'CUSTOMER'
        : 'SUPPLIER'

    const found = await prisma.invoice.findFirst({
      where: {
        id,
        audience: { in: ['CUSTOMER', 'SUPPLIER'] },
        order: this.sellerBuyerWhere(sellerId),
      },
      select: { id: true, orderId: true },
    })
    if (!found) throw httpError('Document not found', 404, 'NotFound')

    const order = await prisma.order.findFirst({
      where: { id: found.orderId, sellerId },
      include: invoiceOrderInclude,
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')

    const files = await generateFiscalDocuments(order, sellerId)
    const picked =
      audience === 'CUSTOMER' ? files.buyerFile : files.supplierFile
    const invoice =
      audience === 'CUSTOMER' ? files.buyerInvoice : files.supplierInvoice

    return {
      status: 200,
      file: {
        buffer: picked.buffer,
        filename: picked.filename,
        contentType: 'application/pdf',
      },
      body: {
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          audience,
          pdfUrl: absolutizeUrl(picked.publicPath, baseUrl),
        },
      },
    }
  }
}

export default new SupplierDocumentService()
