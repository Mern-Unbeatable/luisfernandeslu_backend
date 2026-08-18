import prisma from '../../../../lib/prisma.js'
import { httpError } from '../../../shared/errors.js'
import { money } from '../../../shared/money.js'
import {
  assertSupplier,
  applySupplierStatusChange,
  buildOrderActions,
} from '../status.js'
import {
  CURRENCY,
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

class SupplierCustomerOrderService {
  assertSupplier(auth) {
    return assertSupplier(auth, 'Only suppliers can manage customer orders')
  }

  where(sellerId) {
    return sellerBuyerWhere(sellerId, 'CUSTOMER')
  }

  async getStats(auth) {
    const sellerId = this.assertSupplier(auth)
    const stats = await countSimpleStats(this.where(sellerId))
    return {
      status: 200,
      body: { stats, message: 'Customer order stats fetched' },
    }
  }

  async list(auth, query) {
    const sellerId = this.assertSupplier(auth)
    return paginateOrders({
      where: buildListWhere(this.where(sellerId), query),
      query,
      select: listSelectWithItems,
      message: 'Customer orders fetched',
      mapRow: (o) =>
        mapQuantityRow(o, {
          customerName: o.customer?.name || null,
          email: o.customer?.email || null,
          currency: CURRENCY,
        }),
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
                        parentCategory: { select: { id: true, name: true } },
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

    const transporter = await resolveTransporter(order)
    const products = mapProducts(order.orderLineItems)
    const customer = mapBuyerContact(order)

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
          customer,
          transporter,
          products,
          totals: {
            subtotal: money(order.subTotal) || lineSubtotal(products),
            discount: money(order.discountAmount),
            total: money(order.grandTotal),
            currency: CURRENCY,
          },
          invoice: mapInvoiceSummary(order.invoices?.[0]),
          actions: buildOrderActions(order, transporter),
        },
        message: 'Order details fetched',
      },
    }
  }

  async updateStatus(auth, orderId, body) {
    const sellerId = this.assertSupplier(auth)
    return applySupplierStatusChange({
      where: this.where(sellerId),
      orderId,
      body,
      kind: 'customer',
    })
  }

  async downloadInvoice(auth, orderId, baseUrl) {
    const sellerId = this.assertSupplier(auth)
    return downloadSupplierInvoice({
      sellerId,
      where: { id: orderId, ...this.where(sellerId) },
      baseUrl,
      customerName: (order, session) =>
        order.customer?.name ||
        [session?.firstName, session?.lastName].filter(Boolean).join(' ') ||
        'Customer',
      total: (order) => order.subTotal,
    })
  }
}

export default new SupplierCustomerOrderService()
