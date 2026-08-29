import prisma from '../../../../lib/prisma.js'
import { httpError, conflict } from '../../../shared/errors.js'
import { parsePagination, paginationMeta } from '../../../shared/pagination.js'
import { mapProductMedia } from '../../listings/read.js'

function mapPlan(plan) {
  return {
    id: plan.id,
    label: plan.label,
    durationDays: plan.durationDays,
    price: plan.price,
    currency: plan.currency,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
  }
}

/** Admin Marketing UI statuses (unpaid never appears here). */
function resolveMarketingStatus(row, now = new Date()) {
  if (row.approvalStatus === 'PENDING_REVIEW') return 'pending'
  if (row.approvalStatus === 'REJECTED') return 'rejected'
  if (row.approvalStatus === 'EXPIRED') return 'completed'
  if (row.approvalStatus === 'APPROVED') {
    if (row.endDate && new Date(row.endDate) <= now) return 'completed'
    return 'active'
  }
  return 'pending'
}

function normalizeMarketingStatus(raw) {
  const s = String(raw || 'pending').trim().toLowerCase()
  if (s === 'active') return 'active'
  if (s === 'featured') return 'featured'
  if (s === 'completed') return 'completed'
  if (s === 'rejected') return 'rejected'
  if (s === 'all') return 'all'
  return 'pending'
}

function marketingStatusWhere(status, now) {
  // Unpaid promotions never enter Marketing Management
  const paidOnly = {
    paymentStatus: 'PAID',
    approvalStatus: { not: 'AWAITING_PAYMENT' },
  }

  if (status === 'pending') {
    return { ...paidOnly, approvalStatus: 'PENDING_REVIEW' }
  }
  if (status === 'rejected') {
    return { ...paidOnly, approvalStatus: 'REJECTED' }
  }
  if (status === 'active') {
    return {
      ...paidOnly,
      approvalStatus: 'APPROVED',
      endDate: { gt: now },
    }
  }
  if (status === 'featured') {
    return {
      ...paidOnly,
      approvalStatus: 'APPROVED',
      endDate: { gt: now },
      product: { isFeatured: true },
    }
  }
  if (status === 'completed') {
    return {
      ...paidOnly,
      OR: [
        { approvalStatus: 'EXPIRED' },
        { approvalStatus: 'APPROVED', endDate: { lte: now } },
      ],
    }
  }
  // all — paid + reviewed pipeline only
  return {
    ...paidOnly,
    approvalStatus: { in: ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED'] },
  }
}

function mapPromotion(row, { forAdmin = false } = {}) {
  const base = {
    id: row.id,
    productId: row.productId,
    planId: row.planId,
    amountPaid: row.amountPaid,
    durationDays: row.durationDays,
    paymentStatus: row.paymentStatus,
    paymentRef: row.paymentRef,
    approvalStatus: row.approvalStatus,
    startDate: row.startDate,
    endDate: row.endDate,
    rejectionReason: row.rejectionReason,
    paidAt: row.paidAt,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    plan: row.plan ? mapPlan(row.plan) : null,
    product: row.product
      ? {
          id: row.product.id,
          sku: row.product.sku,
          title: row.product.title,
          approvalStatus: row.product.approvalStatus,
          isFeatured: row.product.isFeatured,
          isSponsored: row.product.isSponsored,
          sellerId: row.product.sellerId,
        }
      : undefined,
  }
  if (forAdmin) {
    base.status = resolveMarketingStatus(row)
  }
  return base
}

function daysLeftLabel(endDate, now = new Date()) {
  if (!endDate) return null
  const end = new Date(endDate)
  if (Number.isNaN(end.getTime()) || end <= now) return null
  const days = Math.max(
    1,
    Math.ceil((end.getTime() - now.getTime()) / 86_400_000),
  )
  return `${days} day${days === 1 ? '' : 's'} left`
}

/** Marketing Management card fields only (Accept / Reject grid). */
function mapAdminMarketingCard(row, baseUrl) {
  const product = row.product
  const { bannerImage, images } = mapProductMedia(product || {}, baseUrl)
  const status = resolveMarketingStatus(row)
  const isFeatured = Boolean(product?.isFeatured)
  return {
    id: row.id,
    status: status === 'active' && isFeatured ? 'featured' : status,
    image: bannerImage?.url || images[0]?.url || null,
    name: product?.title || null,
    description: product?.shortDescription || null,
    basePrice: product?.basePrice ?? null,
    unitOfMeasure: product?.unitOfMeasure || 'bag',
    weightKg: product?.weightKg || 0,
    boostTier: Number(row.amountPaid ?? row.plan?.price ?? 0),
    durationDays: row.durationDays,
    currency: row.plan?.currency || 'USD',
    isFeatured,
    endDate: row.endDate || null,
    timeLeft: daysLeftLabel(row.endDate),
  }
}

export class PromotionService {
  assertSupplier(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    if (auth.role !== 'supplier') {
      throw httpError('Only suppliers can promote products', 403, 'Forbidden')
    }
  }

  /** Active plans for Sponsored Product modal */
  async listActivePlans() {
    const plans = await prisma.promotionPlan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { durationDays: 'asc' }],
    })
    return {
      status: 200,
      body: {
        plans: plans.map(mapPlan),
        message: 'Promotion plans fetched',
      },
    }
  }

  async adminListPlans() {
    const plans = await prisma.promotionPlan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { durationDays: 'asc' }],
    })
    return {
      status: 200,
      body: { plans: plans.map(mapPlan), message: 'Plans fetched' },
    }
  }

  async upsertPlan(body) {
    const plan = await prisma.promotionPlan.upsert({
      where: { durationDays: body.durationDays },
      create: {
        label: body.label,
        durationDays: body.durationDays,
        price: body.price,
        currency: body.currency || 'USD',
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
      },
      update: {
        label: body.label,
        price: body.price,
        currency: body.currency || 'USD',
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
      },
    })
    return {
      status: 200,
      body: { plan: mapPlan(plan), message: 'Promotion plan saved' },
    }
  }

  async updatePlan(planId, body) {
    try {
      const plan = await prisma.promotionPlan.update({
        where: { id: planId },
        data: body,
      })
      return {
        status: 200,
        body: { plan: mapPlan(plan), message: 'Promotion plan updated' },
      }
    } catch (err) {
      if (err?.code === 'P2025') {
        throw httpError('Plan not found', 404, 'NotFound')
      }
      throw err
    }
  }

  /**
   * Supplier clicks Promote → pick admin plan → create unpaid promotion request.
   */
  async requestPromotion(auth, productId, planId) {
    this.assertSupplier(auth)

    const [product, plan] = await Promise.all([
      prisma.product.findFirst({
        where: { id: productId, sellerId: auth.id },
        select: {
          id: true,
          title: true,
          approvalStatus: true,
          isFeatured: true,
          inventory: { select: { listedQuantity: true } },
        },
      }),
      prisma.promotionPlan.findFirst({
        where: { id: planId, isActive: true },
      }),
    ])

    if (!product) throw httpError('Product not found', 404, 'NotFound')
    if (product.approvalStatus !== 'APPROVED') {
      throw httpError(
        'Only approved marketplace products can be promoted',
        400,
        'NotApproved',
      )
    }
    if (Number(product.inventory?.listedQuantity ?? 0) <= 0) {
      throw httpError(
        'List this product on the marketplace before promoting it',
        400,
        'NotListed',
      )
    }
    if (!plan) throw httpError('Promotion plan not found', 404, 'PlanNotFound')

    const activeOrPending = await prisma.productPromotion.findFirst({
      where: {
        productId,
        OR: [
          {
            approvalStatus: {
              in: ['AWAITING_PAYMENT', 'PENDING_REVIEW'],
            },
          },
          {
            approvalStatus: 'APPROVED',
            endDate: { gt: new Date() },
          },
        ],
      },
    })
    if (activeOrPending) {
      throw conflict(
        'This product already has an active or pending promotion',
        'PromotionExists',
        { promotionId: activeOrPending.id },
      )
    }

    const promotion = await prisma.productPromotion.create({
      data: {
        productId,
        planId: plan.id,
        amountPaid: plan.price,
        durationDays: plan.durationDays,
        paymentStatus: 'PENDING_PAYMENT',
        approvalStatus: 'AWAITING_PAYMENT',
      },
      include: { plan: true, product: true },
    })

    return {
      status: 201,
      body: {
        promotion: mapPromotion(promotion),
        message:
          'Promotion selected. Complete payment to send it for admin approval.',
      },
    }
  }

  /**
   * Confirm payment (gateway hook / manual confirm) → admin review queue.
   */
  async confirmPayment(auth, productId, promotionId, paymentRef) {
    this.assertSupplier(auth)

    const promotion = await prisma.productPromotion.findFirst({
      where: {
        id: promotionId,
        productId,
        product: { sellerId: auth.id },
      },
      include: { plan: true, product: true },
    })

    if (!promotion) throw httpError('Promotion not found', 404, 'NotFound')
    if (promotion.approvalStatus !== 'AWAITING_PAYMENT') {
      throw httpError('Promotion is not awaiting payment', 400, 'InvalidStatus')
    }

    const updated = await prisma.productPromotion.update({
      where: { id: promotion.id },
      data: {
        paymentStatus: 'PAID',
        paymentRef: paymentRef || `PROMO-${Date.now().toString(36)}`,
        paidAt: new Date(),
        approvalStatus: 'PENDING_REVIEW',
      },
      include: { plan: true, product: true },
    })

    return {
      status: 200,
      body: {
        promotion: mapPromotion(updated),
        message: 'Payment received. Promotion submitted for admin approval.',
      },
    }
  }

  async adminList(query, baseUrl) {
    await this.expireDuePromotions()

    const { page, limit, skip } = parsePagination(query, { defaultLimit: 12 })
    const status = normalizeMarketingStatus(query.status)
    const search = query.search?.trim() || ''
    const featured =
      typeof query.featured === 'boolean' ? query.featured : undefined
    const now = new Date()
    const and = [marketingStatusWhere(status, now)]

    if (featured !== undefined) {
      and.push({ product: { isFeatured: featured } })
    }

    if (search) {
      and.push({
        OR: [
          { product: { title: { contains: search, mode: 'insensitive' } } },
          { product: { sku: { contains: search, mode: 'insensitive' } } },
        ],
      })
    }

    const where = { AND: and }

    const [total, rows] = await Promise.all([
      prisma.productPromotion.count({ where }),
      prisma.productPromotion.findMany({
        where,
        select: {
          id: true,
          amountPaid: true,
          durationDays: true,
          approvalStatus: true,
          endDate: true,
          plan: { select: { price: true, currency: true } },
          product: {
            select: {
              title: true,
              shortDescription: true,
              basePrice: true,
              unitOfMeasure: true,
              weightKg: true,
              isFeatured: true,
              media: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ])

    return {
      status: 200,
      body: {
        promotions: rows.map((r) => mapAdminMarketingCard(r, baseUrl)),
        pagination: paginationMeta({ page, limit, total }),
        filters: {
          status,
          featured: featured ?? null,
          search: search || null,
        },
        message: 'Promotions fetched',
      },
    }
  }

  async adminModerate(promotionId, body) {
    const next = String(body.status || '').toLowerCase()
    if (next === 'approved') return this.approvePromotion(promotionId)
    return this.rejectPromotion(promotionId, body.reason)
  }

  async approvePromotion(promotionId) {
    const promotion = await prisma.productPromotion.findUnique({
      where: { id: promotionId },
      include: { product: true, plan: true },
    })
    if (!promotion) throw httpError('Promotion not found', 404, 'NotFound')
    if (promotion.approvalStatus !== 'PENDING_REVIEW') {
      throw httpError(
        'Only paid promotions pending review can be approved',
        400,
        'InvalidStatus',
      )
    }
    if (promotion.paymentStatus !== 'PAID') {
      throw httpError('Promotion is not paid', 400, 'NotPaid')
    }

    const startDate = new Date()
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + promotion.durationDays)

    const [updated] = await prisma.$transaction([
      prisma.productPromotion.update({
        where: { id: promotionId },
        data: {
          approvalStatus: 'APPROVED',
          startDate,
          endDate,
          reviewedAt: new Date(),
          rejectionReason: null,
        },
        select: { id: true },
      }),
      prisma.product.update({
        where: { id: promotion.productId },
        data: { isFeatured: true, isSponsored: true },
      }),
    ])

    return {
      status: 200,
      body: {
        id: updated.id,
        message: 'Promotion approved. Product is now active/featured.',
      },
    }
  }

  async rejectPromotion(promotionId, reason = null) {
    const promotion = await prisma.productPromotion.findUnique({
      where: { id: promotionId },
    })
    if (!promotion) throw httpError('Promotion not found', 404, 'NotFound')
    if (promotion.approvalStatus !== 'PENDING_REVIEW') {
      throw httpError(
        'Only promotions pending review can be rejected',
        400,
        'InvalidStatus',
      )
    }
    if (promotion.paymentStatus !== 'PAID') {
      throw httpError('Promotion is not paid', 400, 'NotPaid')
    }

    const updated = await prisma.productPromotion.update({
      where: { id: promotionId },
      data: {
        approvalStatus: 'REJECTED',
        rejectionReason: reason?.trim() || null,
        reviewedAt: new Date(),
      },
      select: { id: true },
    })

    return {
      status: 200,
      body: {
        id: updated.id,
        message: 'Promotion rejected',
      },
    }
  }

  /** Expire featured flags when endDate passed → completed */
  async expireDuePromotions() {
    const now = new Date()
    const due = await prisma.productPromotion.findMany({
      where: {
        approvalStatus: 'APPROVED',
        endDate: { lte: now },
      },
      select: { id: true, productId: true },
    })

    for (const row of due) {
      await prisma.$transaction([
        prisma.productPromotion.update({
          where: { id: row.id },
          data: { approvalStatus: 'EXPIRED' },
        }),
        prisma.product.update({
          where: { id: row.productId },
          data: { isFeatured: false, isSponsored: false },
        }),
      ])
    }

    return { expired: due.length }
  }
}

export default new PromotionService()
