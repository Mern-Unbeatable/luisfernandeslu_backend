import fs from 'node:fs'
import path from 'node:path'
import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { UPLOAD_ROOT } from '../../auth/upload.js'
import { buildSupplierInvoicePdf } from '../../supplier-customer-orders/services/invoice-pdf.js'

function httpError(message, status = 400, code = 'Error', details) {
  return new AppError(message, status, code, details)
}

const CURRENCY = process.env.CART_CURRENCY || 'EUR'
const BUYER_ROLES = ['CUSTOMER', 'COMPANY']

function money(n) {
  return Number(Number(n || 0).toFixed(2))
}

function companyDisplayName(user) {
  return user?.profile?.companyName || user?.name || null
}

function ordinalLabel(n) {
  const num = Number(n) || 0
  const mod100 = num % 100
  if (mod100 >= 11 && mod100 <= 13) return `${num}th Installment`
  switch (num % 10) {
    case 1:
      return `${num}st Installment`
    case 2:
      return `${num}nd Installment`
    case 3:
      return `${num}rd Installment`
    default:
      return `${num}th Installment`
  }
}

const orderInvoiceInclude = {
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
      profile: { select: { companyName: true } },
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

function invoiceNumberFor(prefix, orderNumber, audience) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const tail = String(orderNumber || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-6)
    .toUpperCase()
  const suffix = audience === 'CUSTOMER' ? 'C' : 'S'
  return `${prefix}-${stamp}-${tail || Date.now().toString(36).toUpperCase()}-${suffix}`
}

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
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

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
    const page = Number(query.page) || 1
    const limit = Number(query.limit) || 10
    const skip = (page - 1) * limit
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
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
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

  buildPdfPayload(order, invoice, { showShippingVat }) {
    const ship = order.shippingAddress
    const session = order.checkoutSession
    const sellerAddr = order.seller?.addresses?.[0]?.address
    const sellerAddressText = sellerAddr
      ? [
          sellerAddr.streetAddress,
          sellerAddr.city,
          sellerAddr.state,
          sellerAddr.zipCode,
          sellerAddr.country,
        ]
          .filter(Boolean)
          .join(', ')
      : null

    const customerName =
      companyDisplayName(order.customer) ||
      [session?.firstName, session?.lastName].filter(Boolean).join(' ') ||
      'Customer'

    const customerAddress = ship
      ? [ship.streetAddress, ship.city, ship.state, ship.zipCode, ship.country]
          .filter(Boolean)
          .join(', ')
      : null

    const netSubtotal = money(order.subTotal)
    const discount = money(order.discountAmount)
    const grossSubtotal = money(netSubtotal + discount)
    const shipping = money(order.shippingFee)
    const vat = money(order.vatAmount)
    const grand = money(order.grandTotal)
    const plan = order.paymentPlan
    const isChat = order.orderSource === 'QUOTE_CONVERSION'

    return {
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate || new Date(),
      orderNumber: order.orderNumber,
      orderDate: order.createdAt,
      orderStatus: order.orderStatus,
      paymentMethod: session?.paymentMethod || 'Online Payment',
      currency: CURRENCY,
      showShippingVat: Boolean(showShippingVat),
      seller: {
        companyName: order.seller?.profile?.companyName || order.seller?.name,
        email: order.seller?.email,
        phone: order.seller?.phoneNumber,
        address: sellerAddressText,
      },
      customer: {
        name: customerName,
        email: session?.email || order.customer?.email,
        phone: session?.phone || order.customer?.phoneNumber,
        address: customerAddress,
      },
      items: order.orderLineItems.map((li) => ({
        title: li.product?.title || 'Product',
        quantity: li.quantity,
        unitPrice: money(li.unitPriceLocked),
        total: money(Number(li.unitPriceLocked || 0) * Number(li.quantity || 0)),
      })),
      subtotal: grossSubtotal,
      discount,
      shipping,
      vat,
      total: showShippingVat ? grand : netSubtotal,
      ...(isChat && plan
        ? {
            paymentPlan: {
              termMonths: plan.termMonths,
              downPayment: money(plan.downPayment),
              remainingBalance: money(plan.remainingBalance),
              totalAmount: money(plan.totalAmount),
            },
            installments: (plan.installments || []).map((i) => ({
              installmentNumber: i.installmentNumber,
              title: ordinalLabel(i.installmentNumber),
              dueDate: i.dueDate,
              status: i.status,
              amount: money(i.amount),
            })),
          }
        : {}),
    }
  }

  async writePdf(sellerId, invoice, buffer) {
    const dir = path.join(
      UPLOAD_ROOT,
      'invoices',
      sellerId,
      invoice.audience === 'CUSTOMER' ? 'buyer' : 'supplier',
    )
    fs.mkdirSync(dir, { recursive: true })
    const filename = `${invoice.invoiceNumber}.pdf`.replace(/[^\w.-]/g, '_')
    const absPath = path.join(dir, filename)
    fs.writeFileSync(absPath, buffer)
    const publicPath = `/uploads/invoices/${sellerId}/${invoice.audience === 'CUSTOMER' ? 'buyer' : 'supplier'}/${filename}`
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { pdfUrl: publicPath },
    })
    return { publicPath, filename, buffer }
  }

  async upsertAudienceInvoice(order, audience) {
    const existing = (order.invoices || []).find((i) => i.audience === audience)
    if (existing) return existing
    return prisma.invoice.create({
      data: {
        orderId: order.id,
        audience,
        invoiceNumber: invoiceNumberFor(
          audience === 'SUPPLIER' ? 'DOC' : 'INV',
          order.orderNumber,
          audience,
        ),
      },
    })
  }

  async generatePdfsForOrder(order, sellerId) {
    const supplierInvoice = await this.upsertAudienceInvoice(order, 'SUPPLIER')
    const buyerInvoice = await this.upsertAudienceInvoice(order, 'CUSTOMER')

    const supplierBuffer = await buildSupplierInvoicePdf(
      this.buildPdfPayload(order, supplierInvoice, { showShippingVat: false }),
    )
    const buyerBuffer = await buildSupplierInvoicePdf(
      this.buildPdfPayload(order, buyerInvoice, { showShippingVat: true }),
    )

    const supplierFile = await this.writePdf(sellerId, supplierInvoice, supplierBuffer)
    const buyerFile = await this.writePdf(sellerId, buyerInvoice, buyerBuffer)

    return {
      supplierInvoice: { ...supplierInvoice, pdfUrl: supplierFile.publicPath },
      buyerInvoice: { ...buyerInvoice, pdfUrl: buyerFile.publicPath },
      supplierFile,
      buyerFile,
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
      include: orderInvoiceInclude,
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
    const files = await this.generatePdfsForOrder(order, sellerId)

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
      include: orderInvoiceInclude,
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')

    const files = await this.generatePdfsForOrder(order, sellerId)
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
