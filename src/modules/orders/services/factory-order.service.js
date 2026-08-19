import prisma from '../../../../lib/prisma.js'
import { httpError } from '../../../shared/errors.js'
import { money } from '../../../shared/money.js'
import { companyDisplayName, partyName } from '../../../shared/party.js'
import {
  FACTORY_ORDER_SOURCE,
  FACTORY_STATUS_TRANSITIONS,
  factoryStatusLabel,
  normalizeFactoryActionStatus,
  canSupplierDeleteFactoryOrder,
  buildFactoryOrderActions,
} from '../factory-status-rules.js'
import { CURRENCY, productInclude, weightSizeText } from '../mappers.js'
import { buildFactoryListWhere, paginateOrders } from '../query.js'
import { pickCurrentInstallment } from '../installments.js'
import { mapFactoryOrderDetail } from '../factory-order.mapper.js'

const partySelect = {
  id: true,
  name: true,
  email: true,
  phoneNumber: true,
  role: true,
  profile: { select: { companyName: true, nifNumber: true } },
}

const listSelect = {
  id: true,
  orderNumber: true,
  orderStatus: true,
  grandTotal: true,
  shippingFee: true,
  createdAt: true,
  customerId: true,
  sellerId: true,
  customer: { select: partySelect },
  seller: { select: partySelect },
  orderLineItems: {
    select: {
      id: true,
      quantity: true,
      product: {
        select: {
          id: true,
          title: true,
          weightKg: true,
          unitOfMeasure: true,
          specifications: true,
        },
      },
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
}

function assertRole(auth, role, message) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== role) {
    throw httpError(message, 403, 'Forbidden')
  }
  return auth.id
}

function factoryOrderBase() {
  return { orderSource: FACTORY_ORDER_SOURCE }
}

function mapListRow(o, viewer) {
  const current = pickCurrentInstallment(o.paymentPlan?.installments)
  const firstLine = o.orderLineItems?.[0]
  const product = firstLine?.product
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    orderStatus: o.orderStatus,
    status: factoryStatusLabel(o.orderStatus),
    orderSource: FACTORY_ORDER_SOURCE,
    factoryId: o.sellerId,
    factoryName: companyDisplayName(o.seller),
    companyId: o.customerId,
    companyName: companyDisplayName(o.customer),
    supplier: {
      id: o.customer?.id,
      name: partyName(o.customer),
    },
    factory: {
      id: o.seller?.id,
      name: partyName(o.seller),
    },
    product: product?.title || null,
    qty: firstLine?.quantity ?? null,
    quantityUnit: product?.unitOfMeasure || null,
    weightSize: weightSizeText(product),
    shippingCharge: money(o.shippingFee),
    total: money(o.grandTotal || o.paymentPlan?.totalAmount),
    installmentAmount: current ? money(current.amount) : null,
    installmentNumber: current ? String(current.installmentNumber) : null,
    currency: CURRENCY,
    date: o.createdAt,
    actions: buildFactoryOrderActions(o, viewer),
  }
}

class FactoryOrderService {
  supplierWhere(buyerId) {
    return { ...factoryOrderBase(), customerId: buyerId }
  }

  factoryWhere(sellerId) {
    return { ...factoryOrderBase(), sellerId }
  }

  async listForSupplier(auth, query) {
    const buyerId = assertRole(auth, 'supplier', 'Only suppliers can list factory orders')
    return paginateOrders({
      where: buildFactoryListWhere(this.supplierWhere(buyerId), query, {
        companyParty: 'seller',
      }),
      query,
      select: listSelect,
      message: 'Factory orders fetched',
      mapRow: (o) => mapListRow(o, 'supplier'),
    })
  }

  async listForFactory(auth, query) {
    const sellerId = assertRole(auth, 'factory', 'Only factories can list these orders')
    return paginateOrders({
      where: buildFactoryListWhere(this.factoryWhere(sellerId), query, {
        companyParty: 'customer',
      }),
      query,
      select: listSelect,
      message: 'Supplier factory orders fetched',
      mapRow: (o) => mapListRow(o, 'factory'),
    })
  }

  /** Used by GET /api/factory-offers/orders (factory or supplier). */
  async list(auth, query) {
    const role = String(auth?.role || '').toLowerCase()
    if (role === 'factory') return this.listForFactory(auth, query)
    if (role === 'supplier') return this.listForSupplier(auth, query)
    throw httpError('Forbidden', 403, 'Forbidden')
  }

  async listFactories(auth) {
    const buyerId = assertRole(auth, 'supplier', 'Only suppliers can list factories')
    const rows = await prisma.order.findMany({
      where: this.supplierWhere(buyerId),
      distinct: ['sellerId'],
      select: {
        sellerId: true,
        seller: {
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
        id: r.seller?.id || r.sellerId,
        name: companyDisplayName(r.seller),
        email: r.seller?.email || null,
      }))
      .filter((c) => c.id)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

    return {
      status: 200,
      body: { companies, message: 'Factory filter options fetched' },
    }
  }

  async listCompanies(auth) {
    const sellerId = assertRole(auth, 'factory', 'Only factories can list companies')
    const rows = await prisma.order.findMany({
      where: this.factoryWhere(sellerId),
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

  async findOwned(where, orderId) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, ...where },
      include: {
        customer: { select: partySelect },
        shippingAddress: true,
        checkoutSession: {
          select: { email: true, phone: true },
        },
        orderLineItems: { include: { product: productInclude } },
        paymentPlan: {
          include: {
            installments: {
              orderBy: { installmentNumber: 'asc' },
              include: {
                fulfillmentBridge: {
                  include: {
                    orderLineItem: { select: { id: true } },
                  },
                },
              },
            },
          },
        },
      },
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')
    return order
  }

  mapDetail(order, viewer) {
    return {
      status: 200,
      body: {
        order: mapFactoryOrderDetail(order, viewer),
        message: 'Factory order details fetched',
      },
    }
  }

  async getByIdForSupplier(auth, orderId) {
    const buyerId = assertRole(auth, 'supplier', 'Only suppliers can view factory orders')
    const order = await this.findOwned(this.supplierWhere(buyerId), orderId)
    return this.mapDetail(order, 'supplier')
  }

  async getByIdForFactory(auth, orderId) {
    const sellerId = assertRole(auth, 'factory', 'Only factories can view these orders')
    const order = await this.findOwned(this.factoryWhere(sellerId), orderId)
    return this.mapDetail(order, 'factory')
  }

  async deleteForSupplier(auth, orderId) {
    const buyerId = assertRole(auth, 'supplier', 'Only suppliers can delete factory orders')
    const order = await prisma.order.findFirst({
      where: { id: orderId, ...this.supplierWhere(buyerId) },
      select: { id: true, orderNumber: true, orderStatus: true },
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')
    if (!canSupplierDeleteFactoryOrder(order.orderStatus)) {
      throw httpError(
        'This order can no longer be deleted',
        400,
        'CannotDelete',
        { current: order.orderStatus },
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: order.id },
        data: {
          orderStatus: 'CANCELLED',
          cancellationReason: 'Deleted by supplier',
        },
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          updatedAt: true,
        },
      })
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: 'CANCELLED',
          note: 'Supplier deleted factory order',
        },
      })
      return row
    })

    return {
      status: 200,
      body: {
        order: {
          ...updated,
          status: factoryStatusLabel(updated.orderStatus),
        },
        message: 'Factory order deleted',
      },
    }
  }

  async updateStatusForFactory(auth, orderId, body) {
    const sellerId = assertRole(auth, 'factory', 'Only factories can update these orders')
    const nextStatus = normalizeFactoryActionStatus(body.status)
    if (!nextStatus) {
      throw httpError(
        'status must be IN_PRODUCTION, PRODUCED, or READY',
        400,
        'InvalidStatus',
      )
    }

    const rule = FACTORY_STATUS_TRANSITIONS[nextStatus]
    const order = await prisma.order.findFirst({
      where: { id: orderId, ...this.factoryWhere(sellerId) },
      select: { id: true, orderStatus: true },
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')
    if (!rule.from.includes(order.orderStatus)) {
      throw httpError(rule.invalid, 400, 'InvalidTransition', {
        current: order.orderStatus,
        next: nextStatus,
      })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: order.id },
        data: { orderStatus: nextStatus },
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          updatedAt: true,
        },
      })
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: nextStatus, note: rule.note },
      })
      return row
    })

    return {
      status: 200,
      body: {
        order: {
          ...updated,
          status: factoryStatusLabel(updated.orderStatus),
          actions: buildFactoryOrderActions(updated, 'factory'),
        },
        message: rule.message,
      },
    }
  }
}

export default new FactoryOrderService()
