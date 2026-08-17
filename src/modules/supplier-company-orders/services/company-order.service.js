import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { resolveAssignedTransporterId } from '../../../socket/chatRules.js'
import { UPLOAD_ROOT } from '../../auth/upload.js'
import { buildSupplierInvoicePdf } from '../../supplier-customer-orders/services/invoice-pdf.js'
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
  const leaf = category
  const parent = category.parentCategory
  const root = parent?.parentCategory
  if (root) {
    return { category: parent?.name || null, material: leaf.name || null }
  }
  if (parent) {
    return { category: parent.name || null, material: leaf.name || null }
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

function pickCurrentInstallment(installments) {
  if (!installments?.length) return null
  const sorted = [...installments].sort(
    (a, b) => a.installmentNumber - b.installmentNumber,
  )
  return (
    sorted.find((i) => i.status === 'PENDING' || i.status === 'OVERDUE') ||
    [...sorted].reverse().find((i) => i.status === 'COMPLETED') ||
    sorted[0]
  )
}

function companyDisplayName(user) {
  return user?.profile?.companyName || user?.name || null
}

const productInclude = {
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
            parentCategory: { select: { id: true, name: true } },
          },
        },
      },
    },
  },
}

class SupplierCompanyOrderService {
  assertSupplier(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    const role = String(auth.role || '').toLowerCase()
    if (role !== 'supplier') {
      throw httpError('Only suppliers can manage company orders', 403, 'Forbidden')
    }
    return auth.id
  }

  sellerCompanyWhere(sellerId) {
    return {
      sellerId,
      customer: { role: 'COMPANY' },
    }
  }

  directWhere(sellerId) {
    return {
      ...this.sellerCompanyWhere(sellerId),
      orderSource: 'DIRECT_CART',
    }
  }

  chatWhere(sellerId) {
    return {
      ...this.sellerCompanyWhere(sellerId),
      orderSource: 'QUOTE_CONVERSION',
    }
  }

  buildListWhere(base, query) {
    const search = String(query.search || '').trim()
    const statusFilter = normalizeStatusFilter(query.status)
    const companyId = String(query.companyId || '').trim()

    const where = {
      ...base,
      ...(statusFilter ? { orderStatus: statusFilter } : {}),
      ...(companyId ? { customerId: companyId } : {}),
    }

    if (search) {
      const or = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { email: { contains: search, mode: 'insensitive' } } },
        {
          customer: {
            profile: { companyName: { contains: search, mode: 'insensitive' } },
          },
        },
      ]
      const statusFromSearch = normalizeStatusFilter(search)
      if (statusFromSearch) or.push({ orderStatus: statusFromSearch })
      where.AND = [{ OR: or }]
    }

    return where
  }

  async getStats(auth, query = {}) {
    const sellerId = this.assertSupplier(auth)
    const type = String(query.type || 'direct').toLowerCase() === 'chat'
      ? 'chat'
      : 'direct'

    if (type === 'direct') {
      const base = this.directWhere(sellerId)
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
          type: 'direct',
          stats: { totalOrders, pending, processing, completed },
          message: 'Company direct order stats fetched',
        },
      }
    }

    const base = this.chatWhere(sellerId)
    const activeStatuses = [
      'NEW',
      'PENDING',
      'PROCESSING',
      'ASSIGNED',
      'IN_TRANSIT',
    ]

    const [activeCompanyOrders, revenueAgg, installmentActive, overdueRows] =
      await Promise.all([
        prisma.order.count({
          where: { ...base, orderStatus: { in: activeStatuses } },
        }),
        prisma.order.aggregate({
          where: { ...base, orderStatus: { not: 'CANCELLED' } },
          _sum: { grandTotal: true },
        }),
        prisma.order.count({
          where: {
            ...base,
            orderStatus: { notIn: ['CANCELLED', 'COMPLETED', 'DELIVERED'] },
            paymentPlan: {
              installments: { some: { status: { in: ['PENDING', 'OVERDUE'] } } },
            },
          },
        }),
        prisma.installmentSchedule.findMany({
          where: {
            status: 'OVERDUE',
            paymentPlan: { order: base },
          },
          select: {
            amount: true,
            paymentPlan: { select: { orderId: true } },
          },
        }),
      ])

    const overdueOrderIds = new Set(
      overdueRows.map((r) => r.paymentPlan?.orderId).filter(Boolean),
    )
    const paymentOverdue = money(
      overdueRows.reduce((s, r) => s + Number(r.amount || 0), 0),
    )

    return {
      status: 200,
      body: {
        type: 'chat',
        stats: {
          activeCompanyOrders,
          totalB2bRevenue: money(revenueAgg._sum.grandTotal),
          installmentActive,
          paymentOverdue,
          paymentOverdueOrders: overdueOrderIds.size,
          currency: CURRENCY,
        },
        message: 'Company chat order stats fetched',
      },
    }
  }

  async listCompanies(auth) {
    const sellerId = this.assertSupplier(auth)
    const rows = await prisma.order.findMany({
      where: this.sellerCompanyWhere(sellerId),
      distinct: ['customerId'],
      select: {
        customerId: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            profile: { select: { companyName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const companies = rows
      .map((r) => ({
        id: r.customer?.id || r.customerId,
        name: companyDisplayName(r.customer),
        email: r.customer?.email || null,
      }))
      .filter((c) => c.id)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

    return {
      status: 200,
      body: {
        companies,
        message: 'Company filter options fetched',
      },
    }
  }

  async listDirect(auth, query) {
    const sellerId = this.assertSupplier(auth)
    const page = Number(query.page) || 1
    const limit = Number(query.limit) || 10
    const skip = (page - 1) * limit
    const where = this.buildListWhere(this.directWhere(sellerId), query)

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
          customerId: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              profile: { select: { companyName: true } },
            },
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
        tab: 'direct',
        orderNumber: o.orderNumber,
        orderId: o.orderNumber,
        companyId: o.customerId,
        customerName: companyDisplayName(o.customer),
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
        message: 'Company direct orders fetched',
      },
    }
  }

  async listChat(auth, query) {
    const sellerId = this.assertSupplier(auth)
    const page = Number(query.page) || 1
    const limit = Number(query.limit) || 10
    const skip = (page - 1) * limit
    const where = this.buildListWhere(this.chatWhere(sellerId), query)

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
          customerId: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              profile: { select: { companyName: true } },
            },
          },
          paymentPlan: {
            select: {
              totalAmount: true,
              installments: {
                orderBy: { installmentNumber: 'asc' },
                select: {
                  installmentNumber: true,
                  amount: true,
                  status: true,
                  dueDate: true,
                },
              },
            },
          },
        },
      }),
    ])

    const orders = rows.map((o) => {
      const current = pickCurrentInstallment(o.paymentPlan?.installments)
      return {
        id: o.id,
        tab: 'chat',
        orderNumber: o.orderNumber,
        orderId: o.orderNumber,
        companyId: o.customerId,
        companyName: companyDisplayName(o.customer),
        total: money(o.grandTotal || o.paymentPlan?.totalAmount),
        installmentAmount: current ? money(current.amount) : null,
        installmentNumber: current ? String(current.installmentNumber) : null,
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
        message: 'Company chat orders fetched',
      },
    }
  }

  mapProducts(orderLineItems) {
    return orderLineItems.map((li) => {
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
  }

  buildInstallmentPayload(order) {
    const plan = order.paymentPlan
    if (!plan) {
      return {
        hasInstallment: false,
        payment: null,
        installmentBreakdown: [],
        installments: [],
      }
    }

    const installments = [...(plan.installments || [])].sort(
      (a, b) => a.installmentNumber - b.installmentNumber,
    )
    const paidAmount = money(
      installments
        .filter((i) => i.status === 'COMPLETED')
        .reduce((s, i) => s + Number(i.amount || 0), 0),
    )
    const remainingBalance = money(
      Number(plan.remainingBalance ?? plan.totalAmount - paidAmount),
    )
    const next = installments.find(
      (i) => i.status === 'PENDING' || i.status === 'OVERDUE',
    )
    const monthly =
      installments.length > 0
        ? money(
            installments.reduce((s, i) => s + Number(i.amount || 0), 0) /
              installments.length,
          )
        : null

    const paidCount = installments.filter((i) => i.status === 'COMPLETED').length
    const payment = {
      totalPrice: money(plan.totalAmount || order.grandTotal),
      downPayment: money(plan.downPayment),
      paidAmount,
      remainingBalance,
      duration: `${plan.termMonths} months`,
      termMonths: plan.termMonths,
      paidNote:
        paidCount > 0
          ? `Paid ${paidCount}/${installments.length} installment${installments.length === 1 ? '' : 's'} for ${plan.termMonths} months`
          : monthly != null
            ? `Pay ${CURRENCY === 'EUR' ? '€' : CURRENCY + ' '}${monthly.toLocaleString('en-US', { minimumFractionDigits: 2 })}/month for ${plan.termMonths} months`
            : null,
      nextDueLabel: next
        ? `Next installment due on ${new Date(next.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : null,
      currency: CURRENCY,
    }

    const timeline = installments.map((i) => ({
      id: i.id,
      installmentNumber: i.installmentNumber,
      title: ordinalLabel(i.installmentNumber),
      status: i.status,
      dueDate: i.dueDate,
      amount: money(i.amount),
      paidAt: i.paidAt || null,
      isPaid: i.status === 'COMPLETED',
      currency: CURRENCY,
    }))

    const breakdown = []
    for (const inst of installments) {
      const bridges = inst.fulfillmentBridge || []
      if (bridges.length) {
        for (const bridge of bridges) {
          const li = bridge.orderLineItem
          const path = categoryPath(li?.product?.category)
          const qty = bridge.allocatedQuantity
          const unit = money(li?.unitPriceLocked)
          breakdown.push({
            id: `${inst.id}-${li?.id || 'line'}`,
            productId: li?.productId || null,
            title: li?.product?.title || null,
            category: path.category,
            material: path.material,
            weightSize: weightSizeText(li?.product),
            quantity: qty,
            warehouseLocation:
              li?.warehouseLocation || li?.product?.warehouseLocation || null,
            installmentNumber: ordinalLabel(inst.installmentNumber),
            installmentIndex: inst.installmentNumber,
            amount: money(unit * qty),
            currency: CURRENCY,
          })
        }
      } else {
        // Fallback: split each line item qty evenly across term months
        for (const li of order.orderLineItems || []) {
          const path = categoryPath(li.product?.category)
          const months = Math.max(1, plan.termMonths || installments.length || 1)
          const qty = Math.floor(Number(li.quantity || 0) / months) || 0
          breakdown.push({
            id: `${inst.id}-${li.id}`,
            productId: li.productId,
            title: li.product?.title || null,
            category: path.category,
            material: path.material,
            weightSize: weightSizeText(li.product),
            quantity: qty,
            warehouseLocation:
              li.warehouseLocation || li.product?.warehouseLocation || null,
            installmentNumber: ordinalLabel(inst.installmentNumber),
            installmentIndex: inst.installmentNumber,
            amount: money(inst.amount),
            currency: CURRENCY,
          })
        }
      }
    }

    return {
      hasInstallment: true,
      payment,
      installmentBreakdown: breakdown,
      installments: timeline,
    }
  }

  async resolveTransporter(order) {
    const transporterId =
      order.shipment?.vehicle?.transporterId ||
      (await resolveAssignedTransporterId(order.id))

    if (order.shipment?.vehicle?.transporter) {
      const t = order.shipment.vehicle.transporter
      return {
        id: t.id,
        name: t.name,
        email: t.email,
        phone: t.phoneNumber,
        vehicle: order.shipment.vehicle.licensePlate
          ? `Truck #${order.shipment.vehicle.licensePlate}`
          : null,
      }
    }

    if (!transporterId) return null

    const t = await prisma.user.findUnique({
      where: { id: transporterId },
      select: { id: true, name: true, email: true, phoneNumber: true },
    })
    if (!t) return null
    return {
      id: t.id,
      name: t.name,
      email: t.email,
      phone: t.phoneNumber,
      vehicle: null,
    }
  }

  async getById(auth, orderId) {
    const sellerId = this.assertSupplier(auth)

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        ...this.sellerCompanyWhere(sellerId),
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            role: true,
            profile: { select: { companyName: true, nifNumber: true } },
          },
        },
        shippingAddress: true,
        billingAddress: true,
        invoices: {
          where: { audience: 'SUPPLIER' },
          take: 1,
          select: {
            id: true,
            invoiceNumber: true,
            pdfUrl: true,
            issueDate: true,
          },
        },
        paymentPlan: {
          include: {
            installments: {
              orderBy: { installmentNumber: 'asc' },
              include: {
                fulfillmentBridge: {
                  include: {
                    orderLineItem: {
                      include: { product: productInclude },
                    },
                  },
                },
              },
            },
          },
        },
        project: {
          select: {
            id: true,
            projectName: true,
            location: true,
          },
        },
        checkoutSession: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            paymentStatus: true,
            unloadingType: true,
            accessConditions: true,
            unloadingLocationDescription: true,
          },
        },
        orderLineItems: {
          include: { product: productInclude },
        },
        shipment: {
          select: {
            id: true,
            pickupAddressText: true,
            deliveryAddressText: true,
            vehicle: {
              select: {
                licensePlate: true,
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

    const isChat = order.orderSource === 'QUOTE_CONVERSION'
    const transporter = await this.resolveTransporter(order)
    const products = this.mapProducts(order.orderLineItems)
    const lineSubtotal = money(
      products.reduce((s, p) => s + Number(p.total || 0), 0),
    )
    const installment = this.buildInstallmentPayload(order)

    const supplierInvoice = order.invoices?.[0] || null
    const hasInvoice = Boolean(supplierInvoice)
    const isNew = order.orderStatus === 'NEW'
    const isAssigned =
      order.orderStatus === 'ASSIGNED' || order.orderStatus === 'IN_TRANSIT'
    const isCancel = order.orderStatus === 'CANCELLED'

    const ship = order.shippingAddress
    const session = order.checkoutSession
    const companyName = companyDisplayName(order.customer)

    return {
      status: 200,
      body: {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          orderId: order.orderNumber,
          orderDate: order.createdAt,
          orderStatus: order.orderStatus,
          orderSource: order.orderSource,
          tab: isChat ? 'chat' : 'direct',
          hasInstallment: installment.hasInstallment,
          recipientType: 'company',
          cancelReason: order.cancellationReason || null,
          company: {
            id: order.customer?.id || null,
            name: companyName,
            email: session?.email || order.customer?.email || null,
            phone: session?.phone || order.customer?.phoneNumber || null,
            taxId: order.customer?.profile?.nifNumber || null,
            project: order.project?.projectName || null,
            projectId: order.project?.id || null,
            region: ship?.state || null,
            city: ship?.city || null,
            zipCode: ship?.zipCode || null,
            address: ship?.streetAddress || formatAddress(ship),
            country: ship?.country || null,
          },
          logistics: {
            deliveryLocation:
              order.shipment?.deliveryAddressText ||
              order.project?.location ||
              formatAddress(ship),
            pickupLocation:
              order.shipment?.pickupAddressText ||
              order.project?.projectName ||
              null,
            unloadingType:
              order.unloadingType ||
              session?.unloadingType ||
              null,
            accessCondition: session?.accessConditions || null,
          },
          transporter,
          products,
          payment: installment.payment,
          installmentBreakdown: installment.installmentBreakdown,
          installments: installment.installments,
          totals: isChat
            ? null
            : {
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
        message: 'Company order details fetched',
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
        ...this.sellerCompanyWhere(sellerId),
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
      note = 'Supplier accepted company order'
    } else if (nextStatus === 'PROCESSING') {
      if (current !== 'PENDING') {
        throw httpError(
          'Only PENDING orders can move to PROCESSING',
          400,
          'InvalidTransition',
          { current, next: nextStatus },
        )
      }
      note = 'Supplier marked company order as processing'
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

  async downloadInvoice(auth, orderId, baseUrl) {
    const sellerId = this.assertSupplier(auth)

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        ...this.sellerCompanyWhere(sellerId),
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            profile: { select: { companyName: true } },
          },
        },
        seller: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            profile: {
              select: { companyName: true, nifNumber: true },
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

    const isChat = order.orderSource === 'QUOTE_CONVERSION'

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
      'Company'

    const customerAddress = ship
      ? [ship.streetAddress, ship.city, ship.state, ship.zipCode, ship.country]
          .filter(Boolean)
          .join(', ')
      : null

    const issueDate = invoice.issueDate || new Date()
    const plan = order.paymentPlan

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
      total: money(plan?.totalAmount || order.grandTotal),
      // Chat (quote) invoices only — direct stays normal without this block
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

export default new SupplierCompanyOrderService()
