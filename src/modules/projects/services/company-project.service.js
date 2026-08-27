import prisma from '../../../../lib/prisma.js'
import { httpError } from '../../../shared/errors.js'
import {
  parsePagination,
  paginationMeta,
} from '../../../shared/pagination.js'
import { hasMapboxToken, suggestPlaces } from '../../../shared/distance.js'
import { resolveTransporter } from '../../orders/transporter.js'
import {
  computeProjectStats,
  mapProjectDetail,
  mapProjectListItem,
  mapProjectOrderDetail,
  mapProjectSuggestion,
} from '../company-project.mapper.js'

function assertCompany(auth) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'company') {
    throw httpError('Only companies can manage projects', 403, 'Forbidden')
  }
  return auth.id
}

const orderStatsSelect = {
  id: true,
  orderNumber: true,
  orderStatus: true,
  grandTotal: true,
  createdAt: true,
  orderLineItems: {
    select: {
      productId: true,
      quantity: true,
      product: { select: { title: true, unitOfMeasure: true } },
    },
  },
  paymentPlan: {
    select: {
      downPayment: true,
      remainingBalance: true,
      totalAmount: true,
      termMonths: true,
      installments: {
        select: { amount: true, status: true },
      },
    },
  },
}

const orderDetailInclude = {
  project: { select: { id: true, projectName: true, location: true } },
  seller: {
    select: {
      id: true,
      name: true,
      profile: { select: { companyName: true } },
    },
  },
  shippingAddress: true,
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
          unitOfMeasure: true,
          weightKg: true,
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
        select: { id: true, statusText: true, timestamp: true },
      },
    },
  },
}

class CompanyProjectService {
  async suggestions(auth, query) {
    const userId = assertCompany(auth)
    const term = String(query.q || query.search || '').trim()
    const limit = Math.min(20, Math.max(1, Number(query.limit) || 10))

    const where = { userId }
    if (term) {
      where.OR = [
        { projectName: { contains: term, mode: 'insensitive' } },
        { location: { contains: term, mode: 'insensitive' } },
      ]
    }

    const rows = await prisma.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, projectName: true, location: true },
    })

    return {
      status: 200,
      body: {
        projects: rows.map(mapProjectSuggestion),
        message: 'Project suggestions fetched',
      },
    }
  }

  /**
   * Checkout project-location autocomplete.
   * Combines company's previously used locations + Mapbox places.
   */
  async locationSuggestions(auth, query) {
    const userId = assertCompany(auth)
    const term = String(query.q || query.search || '').trim()
    const limit = Math.min(15, Math.max(1, Number(query.limit) || 8))

    if (term.length < 2) {
      return {
        status: 200,
        body: {
          locations: [],
          message: 'Type at least 2 characters',
        },
      }
    }

    const pastRows = await prisma.project.findMany({
      where: {
        userId,
        location: { contains: term, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, location: true },
    })

    const out = []
    const seen = new Set()

    for (const row of pastRows) {
      const label = String(row.location || '').trim()
      if (!label) continue
      const key = label.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        id: `project:${row.id}`,
        label,
        placeName: label,
        text: label,
        latitude: null,
        longitude: null,
        source: 'project',
      })
      if (out.length >= limit) break
    }

    if (out.length < limit && hasMapboxToken()) {
      try {
        const places = await suggestPlaces(term, {
          limit: limit - out.length,
          country: 'pt',
        })
        for (const p of places) {
          const key = String(p.label || '').toLowerCase()
          if (!key || seen.has(key)) continue
          seen.add(key)
          out.push({ ...p, source: 'mapbox' })
          if (out.length >= limit) break
        }
      } catch (err) {
        console.error('[locationSuggestions] Mapbox:', err.message)
        if (out.length === 0) {
          throw httpError(
            'Location suggestions unavailable',
            502,
            'MapboxSuggestFailed',
          )
        }
      }
    }

    return {
      status: 200,
      body: {
        locations: out,
        message: 'Location suggestions fetched',
      },
    }
  }

  async list(auth, query) {
    const userId = assertCompany(auth)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 20,
      maxLimit: 100,
    })
    const where = { userId }
    const search = String(query.search || '').trim()
    if (search) {
      where.OR = [
        { projectName: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [total, projects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          orders: { select: orderStatsSelect },
        },
      }),
    ])

    return {
      status: 200,
      body: {
        projects: projects.map((p) =>
          mapProjectListItem(p, computeProjectStats(p.orders || [])),
        ),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Projects fetched',
      },
    }
  }

  async getById(auth, projectId, query) {
    const userId = assertCompany(auth)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 20,
      maxLimit: 100,
    })

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    })
    if (!project) throw httpError('Project not found', 404, 'NotFound')

    const whereOrders = { projectId, customerId: userId }
    const [orderTotal, allForStats, ordersPage] = await Promise.all([
      prisma.order.count({ where: whereOrders }),
      prisma.order.findMany({
        where: whereOrders,
        select: orderStatsSelect,
      }),
      prisma.order.findMany({
        where: whereOrders,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: orderStatsSelect,
      }),
    ])

    const stats = computeProjectStats(allForStats)

    return {
      status: 200,
      body: {
        project: mapProjectDetail(project, ordersPage, stats),
        pagination: paginationMeta({
          page,
          limit,
          total: orderTotal,
        }),
        message: 'Project details fetched',
      },
    }
  }

  async getOrder(auth, projectId, orderRef) {
    const userId = assertCompany(auth)
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    })
    if (!project) throw httpError('Project not found', 404, 'NotFound')

    const order = await prisma.order.findFirst({
      where: {
        projectId,
        customerId: userId,
        OR: [{ id: orderRef }, { orderNumber: orderRef }],
      },
      include: orderDetailInclude,
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')

    const transporter = await resolveTransporter(order, {
      includeVehicle: true,
    })

    return {
      status: 200,
      body: {
        order: mapProjectOrderDetail(order, transporter),
        message: 'Order details fetched',
      },
    }
  }
}

export default new CompanyProjectService()
