import prisma from '../../../../lib/prisma.js'
import { httpError, conflict } from '../../../shared/errors.js'
import { parsePagination, paginationMeta } from '../../../shared/pagination.js'

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

function mapPromotion(row) {
  return {
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

  async adminList(query) {
    const { page, limit, skip } = parsePagination(query, { defaultLimit: 12 })
    const where =
      query.status && query.status !== 'all'
        ? { approvalStatus: query.status }
        : {}

    const [total, rows] = await Promise.all([
      prisma.productPromotion.count({ where }),
      prisma.productPromotion.findMany({
        where,
        include: {
          plan: true,
          product: {
            select: {
              id: true,
              sku: true,
              title: true,
              approvalStatus: true,
              isFeatured: true,
              isSponsored: true,
              sellerId: true,
              seller: { select: { id: true, name: true, email: true } },
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
        promotions: rows.map((r) => ({
          ...mapPromotion(r),
          seller: r.product?.seller,
        })),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Promotions fetched',
      },
    }
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
        include: { plan: true, product: true },
      }),
      prisma.product.update({
        where: { id: promotion.productId },
        data: { isFeatured: true, isSponsored: true },
      }),
    ])

    return {
      status: 200,
      body: {
        promotion: mapPromotion(updated),
        message: 'Promotion approved. Product is now featured.',
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

    const updated = await prisma.productPromotion.update({
      where: { id: promotionId },
      data: {
        approvalStatus: 'REJECTED',
        rejectionReason: reason?.trim() || null,
        reviewedAt: new Date(),
      },
      include: { plan: true, product: true },
    })

    return {
      status: 200,
      body: {
        promotion: mapPromotion(updated),
        message: 'Promotion rejected',
      },
    }
  }

  /** Expire featured flags when endDate passed */
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
