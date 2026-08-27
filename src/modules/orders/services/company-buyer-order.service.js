import prisma from '../../../../lib/prisma.js'
import { httpError } from '../../../shared/errors.js'
import {
  parsePagination,
  paginationMeta,
} from '../../../shared/pagination.js'
import { resolveTransporter } from '../transporter.js'
import {
  companyStatusFilter,
  mapCompanyOrderDetail,
  mapCompanyOrderListItem,
} from '../company-buyer-order.mapper.js'

function assertCompany(auth) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'company') {
    throw httpError('Only companies can view these orders', 403, 'Forbidden')
  }
  return auth.id
}

function orderRefWhere(customerId, orderRef) {
  return {
    customerId,
    OR: [{ id: orderRef }, { orderNumber: orderRef }],
  }
}

const listProductSelect = {
  id: true,
  title: true,
  unitOfMeasure: true,
}

const detailInclude = {
  project: { select: { id: true, projectName: true, location: true } },
  shippingAddress: true,
  checkoutSession: {
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      unloadingLocationDescription: true,
      accessConditions: true,
      project: { select: { projectName: true, location: true } },
    },
  },
  orderLineItems: {
    orderBy: { id: 'asc' },
    select: {
      id: true,
      productId: true,
      quantity: true,
      unitPriceLocked: true,
      totalPriceLocked: true,
      product: {
        select: {
          id: true,
          title: true,
          sku: true,
          weightKg: true,
          unitOfMeasure: true,
        },
      },
    },
  },
  paymentPlan: {
    include: {
      installments: {
        orderBy: { installmentNumber: 'asc' },
        select: {
          id: true,
          installmentNumber: true,
          amount: true,
          dueDate: true,
          status: true,
          paidAt: true,
        },
      },
    },
  },
  statusHistory: {
    orderBy: { createdAt: 'asc' },
    select: { status: true, note: true, createdAt: true },
  },
  shipment: {
    select: {
      id: true,
      tripStartedAt: true,
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
      trackingEvents: {
        orderBy: { timestamp: 'asc' },
        select: {
          id: true,
          statusText: true,
          timestamp: true,
        },
      },
    },
  },
}

class CompanyBuyerOrderService {
  async list(auth, query) {
    const customerId = assertCompany(auth)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 20,
      maxLimit: 100,
    })

    const where = { customerId }
    const status = companyStatusFilter(query.status)
    if (status) where.orderStatus = status

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          createdAt: true,
          project: {
            select: { projectName: true, location: true },
          },
          shippingAddress: true,
          checkoutSession: {
            select: {
              project: { select: { projectName: true, location: true } },
            },
          },
          orderLineItems: {
            take: 1,
            orderBy: { id: 'asc' },
            select: {
              quantity: true,
              product: { select: listProductSelect },
            },
          },
        },
      }),
    ])

    return {
      status: 200,
      body: {
        orders: orders.map(mapCompanyOrderListItem),
        pagination: paginationMeta({ page, limit, total }),
        filters: { status: query.status || 'all' },
        message: 'Orders fetched',
      },
    }
  }

  async getById(auth, orderRef) {
    const customerId = assertCompany(auth)
    const order = await prisma.order.findFirst({
      where: orderRefWhere(customerId, orderRef),
      include: detailInclude,
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')

    // Prefer checkout unloading/access when order fields empty
    if (!order.unloadingType && order.checkoutSession?.unloadingLocationDescription) {
      order.unloadingType = order.checkoutSession.unloadingLocationDescription
    }
    if (!order.siteConditions && order.checkoutSession?.accessConditions) {
      order.siteConditions = order.checkoutSession.accessConditions
    }

    const transporter = await resolveTransporter(order, {
      includeVehicle: true,
    })

    return {
      status: 200,
      body: {
        order: mapCompanyOrderDetail(order, transporter),
        message: 'Order details fetched',
      },
    }
  }
}

export default new CompanyBuyerOrderService()
