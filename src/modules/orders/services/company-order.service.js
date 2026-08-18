import prisma from '../../../../lib/prisma.js'
import { httpError } from '../../../shared/errors.js'
import { money } from '../../../shared/money.js'
import { formatAddressLine } from '../../../shared/address.js'
import { companyDisplayName } from '../../../shared/party.js'
import {
  assertSupplier,
  applySupplierStatusChange,
  buildOrderActions,
} from '../status.js'
import {
  CURRENCY,
  productInclude,
  mapProducts,
  mapInvoiceSummary,
  mapBuyerContact,
  lineSubtotal,
} from '../mappers.js'
import {
  sellerBuyerWhere,
  buildListWhere,
  countSimpleStats,
  paginateOrders,
  mapQuantityRow,
  listSelectWithItems,
} from '../query.js'
import { resolveTransporter } from '../transporter.js'
import { downloadSupplierInvoice } from '../invoice.js'
import {
  pickCurrentInstallment,
  buildInstallmentPayload,
} from '../installments.js'

class SupplierCompanyOrderService {
  assertSupplier(auth) {
    return assertSupplier(auth, 'Only suppliers can manage company orders')
  }

  where(sellerId) {
    return sellerBuyerWhere(sellerId, 'COMPANY')
  }

  directWhere(sellerId) {
    return { ...this.where(sellerId), orderSource: 'DIRECT_CART' }
  }

  chatWhere(sellerId) {
    return { ...this.where(sellerId), orderSource: 'QUOTE_CONVERSION' }
  }

  async getStats(auth, query = {}) {
    const sellerId = this.assertSupplier(auth)
    const type =
      String(query.type || 'direct').toLowerCase() === 'chat' ? 'chat' : 'direct'

    if (type === 'direct') {
      const stats = await countSimpleStats(this.directWhere(sellerId))
      return {
        status: 200,
        body: {
          type: 'direct',
          stats,
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

    return {
      status: 200,
      body: {
        type: 'chat',
        stats: {
          activeCompanyOrders,
          totalB2bRevenue: money(revenueAgg._sum.grandTotal),
          installmentActive,
          paymentOverdue: money(
            overdueRows.reduce((s, r) => s + Number(r.amount || 0), 0),
          ),
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
      where: this.where(sellerId),
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
      body: { companies, message: 'Company filter options fetched' },
    }
  }

  async listDirect(auth, query) {
    const sellerId = this.assertSupplier(auth)
    return paginateOrders({
      where: buildListWhere(this.directWhere(sellerId), query, {
        searchCompanyName: true,
      }),
      query,
      select: listSelectWithItems,
      message: 'Company direct orders fetched',
      mapRow: (o) =>
        mapQuantityRow(o, {
          tab: 'direct',
          companyId: o.customerId,
          customerName: companyDisplayName(o.customer),
          email: o.customer?.email || null,
          currency: CURRENCY,
        }),
    })
  }

  async listChat(auth, query) {
    const sellerId = this.assertSupplier(auth)
    return paginateOrders({
      where: buildListWhere(this.chatWhere(sellerId), query, {
        searchCompanyName: true,
      }),
      query,
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
      message: 'Company chat orders fetched',
      mapRow: (o) => {
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
      },
    })
  }

  async getById(auth, orderId) {
    const sellerId = this.assertSupplier(auth)
    const order = await prisma.order.findFirst({
      where: { id: orderId, ...this.where(sellerId) },
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
                    orderLineItem: { include: { product: productInclude } },
                  },
                },
              },
            },
          },
        },
        project: {
          select: { id: true, projectName: true, location: true },
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
        orderLineItems: { include: { product: productInclude } },
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
    const transporter = await resolveTransporter(order, { includeVehicle: true })
    const products = mapProducts(order.orderLineItems)
    const installment = buildInstallmentPayload(order)
    const companyName = companyDisplayName(order.customer)
    const company = {
      ...mapBuyerContact(order, companyName),
      taxId: order.customer?.profile?.nifNumber || null,
      project: order.project?.projectName || null,
      projectId: order.project?.id || null,
    }
    const ship = order.shippingAddress
    const session = order.checkoutSession

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
          company,
          logistics: {
            deliveryLocation:
              order.shipment?.deliveryAddressText ||
              order.project?.location ||
              formatAddressLine(ship),
            pickupLocation:
              order.shipment?.pickupAddressText ||
              order.project?.projectName ||
              null,
            unloadingType: order.unloadingType || session?.unloadingType || null,
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
                subtotal: money(order.subTotal) || lineSubtotal(products),
                discount: money(order.discountAmount),
                total: money(order.grandTotal),
                currency: CURRENCY,
              },
          invoice: mapInvoiceSummary(order.invoices?.[0]),
          actions: buildOrderActions(order, transporter),
        },
        message: 'Company order details fetched',
      },
    }
  }

  async updateStatus(auth, orderId, body) {
    const sellerId = this.assertSupplier(auth)
    return applySupplierStatusChange({
      where: this.where(sellerId),
      orderId,
      body,
      kind: 'company',
    })
  }

  async downloadInvoice(auth, orderId, baseUrl) {
    const sellerId = this.assertSupplier(auth)
    return downloadSupplierInvoice({
      sellerId,
      where: { id: orderId, ...this.where(sellerId) },
      baseUrl,
      includeChatPlan: true,
      customerName: (order, session) =>
        companyDisplayName(order.customer) ||
        [session?.firstName, session?.lastName].filter(Boolean).join(' ') ||
        'Company',
      total: (order, plan) => plan?.totalAmount || order.grandTotal,
    })
  }
}

export default new SupplierCompanyOrderService()
