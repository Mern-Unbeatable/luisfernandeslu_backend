import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { resolveAssignedTransporterId } from '../../../socket/chatRules.js'
import { UPLOAD_ROOT } from '../../auth/upload.js'
import { buildSupplierInvoicePdf } from './invoice-pdf.js'
import fs from 'node:fs'
import path from 'node:path'

function httpError(message, status = 400, code = 'Error', details) {
  return new AppError(message, status, code, details)
}

const CURRENCY = process.env.CART_CURRENCY || 'EUR'

const ORDER_STATUSES = [
  'NEW',
  'PENDING',
  'PROCESSING',
  'ASSIGNED',
  'IN_TRANSIT',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
]

function normalizeStatusFilter(raw) {
  if (!raw || raw === 'all') return null
  const s = String(raw).trim().toLowerCase()
  if (s === 'new') return 'NEW'
  if (s === 'pending') return 'PENDING'
  if (s === 'processing') return 'PROCESSING'
  if (s === 'assigned') return { in: ['ASSIGNED', 'IN_TRANSIT'] }
  if (s === 'cancel' || s === 'cancelled') return 'CANCELLED'
  if (s === 'completed') return { in: ['COMPLETED', 'DELIVERED'] }
  const upper = String(raw).toUpperCase()
  if (ORDER_STATUSES.includes(upper)) return upper
  return null
}

function normalizeActionStatus(raw) {
  const s = String(raw || '').trim().toUpperCase()
  if (s === 'ACCEPT' || s === 'PENDING') return 'PENDING'
  if (s === 'PROCESSING') return 'PROCESSING'
  if (s === 'CANCEL' || s === 'CANCELLED') return 'CANCELLED'
  return null
}

function money(n) {
  return Number(Number(n || 0).toFixed(2))
}

function formatAddress(a) {
  if (!a) return null
  return [a.streetAddress, a.city, a.state, a.zipCode, a.country]
    .filter(Boolean)
    .join(', ')
}

function categoryPath(category) {
  if (!category) return { category: null, material: null }
  // type → sub → root (product.category is usually leaf/type)
  const leaf = category
  const parent = category.parentCategory
  const root = parent?.parentCategory
  if (root) {
    return {
      category: parent?.name || null,
      material: leaf.name || null,
    }
  }
  if (parent) {
    return {
      category: parent.name || null,
      material: leaf.name || null,
    }
  }
  return { category: leaf.name || null, material: null }
}

function weightSizeText(product) {
  const parts = []
  if (product?.weightKg) parts.push(`${product.weightKg} kg`)
  if (product?.unitOfMeasure) parts.push(product.unitOfMeasure)
  if (product?.specifications) {
    const spec = String(product.specifications).slice(0, 80)
    if (spec) parts.push(spec)
  }
  return parts.join(', ') || null
}

class SupplierCustomerOrderService {
  assertSupplier(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    const role = String(auth.role || '').toLowerCase()
    if (role !== 'supplier') {
      throw httpError('Only suppliers can manage customer orders', 403, 'Forbidden')
    }
    return auth.id
  }

  sellerCustomerWhere(sellerId) {
    return {
      sellerId,
      customer: { role: 'CUSTOMER' },
    }
  }

  async getStats(auth) {
    const sellerId = this.assertSupplier(auth)
    const base = this.sellerCustomerWhere(sellerId)

    const [totalOrders, pending, processing, completed] = await Promise.all([
      prisma.order.count({ where: base }),
      prisma.order.count({ where: { ...base, orderStatus: 'PENDING' } }),
      prisma.order.count({ where: { ...base, orderStatus: 'PROCESSING' } }),
      prisma.order.count({
        where: { ...base, orderStatus: { in: ['COMPLETED', 'DELIVERED'] } },
      }),
    ])

    return {
      status: 200,
      body: {
        stats: {
          totalOrders,
          pending,
          processing,
          completed,
        },
        message: 'Customer order stats fetched',
      },
    }
  }

  async list(auth, query) {
    const sellerId = this.assertSupplier(auth)
    const page = Number(query.page) || 1
    const limit = Number(query.limit) || 10
    const skip = (page - 1) * limit
    const search = String(query.search || '').trim()
    const statusFilter = normalizeStatusFilter(query.status)

    const where = {
      ...this.sellerCustomerWhere(sellerId),
      ...(statusFilter ? { orderStatus: statusFilter } : {}),
    }

    if (search) {
      const or = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { email: { contains: search, mode: 'insensitive' } } },
      ]
      const statusFromSearch = normalizeStatusFilter(search)
      if (statusFromSearch) {
        or.push({ orderStatus: statusFromSearch })
      }
      where.AND = [{ OR: or }]
    }

    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          grandTotal: true,
          createdAt: true,
          customer: {
            select: { id: true, name: true, email: true },
          },
          orderLineItems: { select: { id: true, quantity: true } },
        },
      }),
    ])

    const orders = rows.map((o) => {
      const itemCount = o.orderLineItems.length
      const totalQuantity = o.orderLineItems.reduce(
        (s, li) => s + Number(li.quantity || 0),
        0,
      )
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        orderId: o.orderNumber,
        customerName: o.customer?.name || null,
        email: o.customer?.email || null,
        items: itemCount,
        totalQuantity,
        total: money(o.grandTotal),
        currency: CURRENCY,
        orderStatus: o.orderStatus,
        date: o.createdAt,
      }
    })

    return {
      status: 200,
      body: {
        orders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        message: 'Customer orders fetched',
      },
    }
  }

  async getById(auth, orderId) {
    const sellerId = this.assertSupplier(auth)

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        ...this.sellerCustomerWhere(sellerId),
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            role: true,
          },
        },
        shippingAddress: true,
        billingAddress: true,
        invoices: {
          where: { audience: 'SUPPLIER' },
          take: 1,
          select: { id: true, invoiceNumber: true, pdfUrl: true, issueDate: true },
        },
        paymentPlan: { select: { id: true } },
        checkoutSession: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            paymentStatus: true,
          },
        },
        project: { select: { id: true, projectName: true, location: true } },
        orderLineItems: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                sku: true,
                weightKg: true,
                unitOfMeasure: true,
                specifications: true,
                warehouseLocation: true,
                category: {
                  select: {
                    id: true,
                    name: true,
                    parentCategory: {
                      select: {
                        id: true,
                        name: true,
                        parentCategory: {
                          select: { id: true, name: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        shipment: {
          select: {
            id: true,
            vehicle: {
              select: {
                transporterId: true,
                transporter: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    phoneNumber: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!order) throw httpError('Order not found', 404, 'NotFound')

    const transporterId =
      order.shipment?.vehicle?.transporterId ||
      (await resolveAssignedTransporterId(order.id))

    let transporter = null
    if (order.shipment?.vehicle?.transporter) {
      const t = order.shipment.vehicle.transporter
      transporter = {
        id: t.id,
        name: t.name,
        email: t.email,
        phone: t.phoneNumber,
      }
    } else if (transporterId) {
      const t = await prisma.user.findUnique({
        where: { id: transporterId },
        select: { id: true, name: true, email: true, phoneNumber: true },
      })
      if (t) {
        transporter = {
          id: t.id,
          name: t.name,
          email: t.email,
          phone: t.phoneNumber,
        }
      }
    }

    const supplierInvoice = order.invoices?.[0] || null
    const hasInvoice = Boolean(supplierInvoice)
    const isNew = order.orderStatus === 'NEW'
    const isAssigned =
      order.orderStatus === 'ASSIGNED' || order.orderStatus === 'IN_TRANSIT'
    const isCancel = order.orderStatus === 'CANCELLED'

    const ship = order.shippingAddress
    const session = order.checkoutSession

    const customerName =
      order.customer?.name ||
      [session?.firstName, session?.lastName].filter(Boolean).join(' ') ||
      null

    const products = order.orderLineItems.map((li) => {
      const path = categoryPath(li.product?.category)
      return {
        id: li.id,
        productId: li.productId,
        title: li.product?.title || null,
        category: path.category,
        material: path.material,
        weightSize: weightSizeText(li.product),
        quantity: li.quantity,
        unit: li.product?.unitOfMeasure || null,
        unitPrice: money(li.unitPriceLocked),
        warehouseLocation:
          li.warehouseLocation || li.product?.warehouseLocation || null,
        total: money(li.totalPriceLocked),
      }
    })

    const lineSubtotal = money(
      products.reduce((s, p) => s + Number(p.total || 0), 0),
    )

    return {
      status: 200,
      body: {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          orderId: order.orderNumber,
          orderDate: order.createdAt,
          orderStatus: order.orderStatus,
          hasInstallment: Boolean(order.paymentPlan),
          recipientType: 'customer',
          cancelReason: order.cancellationReason || null,
          customer: {
            id: order.customer?.id || null,
            name: customerName,
            email: session?.email || order.customer?.email || null,
            phone: session?.phone || order.customer?.phoneNumber || null,
            region: ship?.state || null,
            city: ship?.city || null,
            zipCode: ship?.zipCode || null,
            address: ship?.streetAddress || formatAddress(ship),
            country: ship?.country || null,
          },
          transporter,
          products,
          totals: {
            subtotal: money(order.subTotal) || lineSubtotal,
            discount: money(order.discountAmount),
            total: money(order.grandTotal),
            currency: CURRENCY,
          },
          invoice: hasInvoice
            ? {
                id: supplierInvoice.id,
                invoiceNumber: supplierInvoice.invoiceNumber,
                pdfUrl: supplierInvoice.pdfUrl,
                issueDate: supplierInvoice.issueDate,
              }
            : null,
          actions: {
            canAccept: isNew,
            canMarkProcessing: order.orderStatus === 'PENDING',
            canCancel: ['NEW', 'PENDING', 'PROCESSING'].includes(
              order.orderStatus,
            ),
            showDownloadInvoice: !isNew,
            canDownloadInvoice: !isNew,
            hasInvoice,
            showTransporter: isAssigned || (isCancel && Boolean(transporter)),
            canMessageTransporter: isAssigned && Boolean(transporter),
          },
        },
        message: 'Order details fetched',
      },
    }
  }

  async updateStatus(auth, orderId, body) {
    const sellerId = this.assertSupplier(auth)
    const nextStatus = normalizeActionStatus(body.status)
    if (!nextStatus) {
      throw httpError(
        'status must be PENDING (accept), PROCESSING, or CANCELLED',
        400,
        'InvalidStatus',
      )
    }

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        ...this.sellerCustomerWhere(sellerId),
      },
      select: {
        id: true,
        orderStatus: true,
        cancellationReason: true,
      },
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')

    const current = order.orderStatus
    let note = null

    if (nextStatus === 'PENDING') {
      if (current !== 'NEW') {
        throw httpError(
          'Only NEW orders can be accepted (→ PENDING)',
          400,
          'InvalidTransition',
          { current, next: nextStatus },
        )
      }
      note = 'Supplier accepted order'
    } else if (nextStatus === 'PROCESSING') {
      if (current !== 'PENDING') {
        throw httpError(
          'Only PENDING orders can move to PROCESSING',
          400,
          'InvalidTransition',
          { current, next: nextStatus },
        )
      }
      note = 'Supplier marked order as processing'
    } else if (nextStatus === 'CANCELLED') {
      if (!['NEW', 'PENDING', 'PROCESSING'].includes(current)) {
        throw httpError(
          'Order cannot be cancelled in current status',
          400,
          'InvalidTransition',
          { current, next: nextStatus },
        )
      }
      note = body.reason?.trim() || 'Order cancelled by supplier'
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: order.id },
        data: {
          orderStatus: nextStatus,
          ...(nextStatus === 'CANCELLED'
            ? { cancellationReason: body.reason.trim() }
            : {}),
        },
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          cancellationReason: true,
          updatedAt: true,
        },
      })

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: nextStatus,
          note,
        },
      })

      return row
    })

    return {
      status: 200,
      body: {
        id: updated.id,
        orderNumber: updated.orderNumber,
        orderStatus: updated.orderStatus,
        cancelReason: updated.cancellationReason,
        message:
          nextStatus === 'PENDING'
            ? 'Order accepted'
            : nextStatus === 'PROCESSING'
              ? 'Order marked as processing'
              : 'Order cancelled',
      },
    }
  }

  invoiceNumberFor(orderNumber) {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const tail = String(orderNumber || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-6)
      .toUpperCase()
    return `INV-${stamp}-${tail || Date.now().toString(36).toUpperCase()}`
  }

  /**
   * Generate (if needed) + return downloadable invoice PDF for supplier.
   * Design: header contact + INVOICE meta, customer/order details, items, totals.
   * No logo.
   */
  async downloadInvoice(auth, orderId, baseUrl) {
    const sellerId = this.assertSupplier(auth)

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        ...this.sellerCustomerWhere(sellerId),
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
        seller: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            profile: {
              select: {
                companyName: true,
                nifNumber: true,
              },
            },
            addresses: {
              where: { addressType: 'WAREHOUSE', isDefault: true },
              take: 1,
              include: { address: true },
            },
          },
        },
        shippingAddress: true,
        invoices: {
          where: { audience: 'SUPPLIER' },
          take: 1,
        },
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
          include: {
            product: { select: { id: true, title: true, sku: true } },
          },
        },
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

    let invoice = order.invoices?.[0] || null
    if (!invoice) {
      invoice = await prisma.invoice.create({
        data: {
          orderId: order.id,
          audience: 'SUPPLIER',
          invoiceNumber: this.invoiceNumberFor(order.orderNumber),
        },
      })
    }

    const ship = order.shippingAddress
    const session = order.checkoutSession
    const sellerAddr = order.seller?.addresses?.[0]?.address
    const sellerAddressText = sellerAddr
      ? [sellerAddr.streetAddress, sellerAddr.city, sellerAddr.state, sellerAddr.zipCode, sellerAddr.country]
          .filter(Boolean)
          .join(', ')
      : null

    const customerName =
      order.customer?.name ||
      [session?.firstName, session?.lastName].filter(Boolean).join(' ') ||
      'Customer'

    const customerAddress = ship
      ? [ship.streetAddress, ship.city, ship.state, ship.zipCode, ship.country]
          .filter(Boolean)
          .join(', ')
      : null

    const issueDate = invoice.issueDate || new Date()

    const pdfData = {
      invoiceNumber: invoice.invoiceNumber,
      issueDate,
      orderNumber: order.orderNumber,
      orderDate: order.createdAt,
      orderStatus: order.orderStatus,
      paymentMethod: session?.paymentMethod || 'Online Payment',
      currency: CURRENCY,
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
        total: money(li.totalPriceLocked),
      })),
      subtotal: money(order.subTotal),
      discount: money(order.discountAmount),
      shipping: money(order.shippingFee),
      vat: money(order.vatAmount),
      total: money(order.grandTotal),
    }

    const buffer = await buildSupplierInvoicePdf(pdfData)

    const dir = path.join(UPLOAD_ROOT, 'invoices', sellerId)
    fs.mkdirSync(dir, { recursive: true })
    const filename = `${invoice.invoiceNumber}.pdf`.replace(/[^\w.-]/g, '_')
    const absPath = path.join(dir, filename)
    fs.writeFileSync(absPath, buffer)

    const publicPath = `/uploads/invoices/${sellerId}/${filename}`
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { pdfUrl: publicPath },
    })

    return {
      status: 200,
      file: {
        buffer,
        filename,
        contentType: 'application/pdf',
      },
      body: {
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          pdfUrl: absolutizeUrl(publicPath, baseUrl),
          issueDate,
        },
        message: 'Invoice ready',
      },
    }
  }
}

export default new SupplierCustomerOrderService()
