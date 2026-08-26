import prisma from '../../../../lib/prisma.js'
import { httpError } from '../../../shared/errors.js'
import {
  parsePagination,
  paginationMeta,
} from '../../../shared/pagination.js'
import {
  mapCreatedReview,
  mapPendingReviewItem,
} from '../buyer-reviews.mapper.js'

const DELIVERED = ['DELIVERED', 'COMPLETED']

const productSelect = {
  id: true,
  title: true,
  shortDescription: true,
  longDescription: true,
  averageRating: true,
  reviewCount: true,
  media: { orderBy: { sortOrder: 'asc' }, take: 3 },
}

function assertBuyer(auth) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  const role = String(auth.role || '').toLowerCase()
  if (role !== 'customer' && role !== 'company') {
    throw httpError('Only buyers can manage reviews', 403, 'Forbidden')
  }
  return auth.id
}

async function refreshProductRating(tx, productId) {
  const agg = await tx.review.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: { _all: true },
  })
  const count = agg._count._all || 0
  const avg = count > 0 ? Number((agg._avg.rating || 0).toFixed(1)) : 0
  await tx.product.update({
    where: { id: productId },
    data: { averageRating: avg, reviewCount: count },
  })
  return { averageRating: avg, reviewCount: count }
}

class BuyerReviewsService {
  async listPending(auth, query, baseUrl) {
    const customerId = assertBuyer(auth)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 20,
      maxLimit: 100,
    })

    const reviewed = await prisma.review.findMany({
      where: { authorId: customerId, productId: { not: null } },
      select: { productId: true },
    })
    const reviewedIds = [
      ...new Set(reviewed.map((r) => r.productId).filter(Boolean)),
    ]

    const where = {
      order: {
        customerId,
        orderStatus: { in: DELIVERED },
      },
      ...(reviewedIds.length
        ? { productId: { notIn: reviewedIds } }
        : {}),
    }

    const [total, rows] = await Promise.all([
      prisma.orderLineItem.count({ where }),
      prisma.orderLineItem.findMany({
        where,
        orderBy: { order: { updatedAt: 'desc' } },
        skip,
        take,
        select: {
          id: true,
          productId: true,
          quantity: true,
          product: { select: productSelect },
          order: {
            select: {
              id: true,
              orderNumber: true,
              orderStatus: true,
              updatedAt: true,
            },
          },
        },
      }),
    ])

    return {
      status: 200,
      body: {
        products: rows.map((row) => mapPendingReviewItem(row, baseUrl)),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Products to review fetched',
      },
    }
  }

  async getPending(auth, lineItemId, baseUrl) {
    const customerId = assertBuyer(auth)
    const line = await this.#findReviewableLine(customerId, lineItemId)

    const existing = await prisma.review.findFirst({
      where: { authorId: customerId, productId: line.productId },
      select: { id: true },
    })
    if (existing) {
      throw httpError(
        'You have already reviewed this product',
        400,
        'AlreadyReviewed',
      )
    }

    return {
      status: 200,
      body: {
        product: mapPendingReviewItem(line, baseUrl),
        message: 'Product to review fetched',
      },
    }
  }

  async create(auth, body) {
    const customerId = assertBuyer(auth)
    const line = await this.#findReviewableLine(
      customerId,
      body.orderLineItemId,
    )

    const existing = await prisma.review.findFirst({
      where: { authorId: customerId, productId: line.productId },
      select: { id: true },
    })
    if (existing) {
      throw httpError(
        'You have already reviewed this product',
        400,
        'AlreadyReviewed',
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          authorId: customerId,
          productId: line.productId,
          rating: body.rating,
          comment: body.comment,
        },
        select: {
          id: true,
          productId: true,
          rating: true,
          comment: true,
          createdAt: true,
        },
      })
      const stats = await refreshProductRating(tx, line.productId)
      return { review, stats }
    })

    return {
      status: 201,
      body: {
        review: mapCreatedReview(result.review),
        product: {
          id: line.productId,
          averageRating: result.stats.averageRating,
          reviewCount: result.stats.reviewCount,
        },
        message: 'Review submitted',
      },
    }
  }

  async #findReviewableLine(customerId, lineItemId) {
    const line = await prisma.orderLineItem.findFirst({
      where: {
        id: lineItemId,
        order: {
          customerId,
          orderStatus: { in: DELIVERED },
        },
      },
      select: {
        id: true,
        productId: true,
        quantity: true,
        product: { select: productSelect },
        order: {
          select: {
            id: true,
            orderNumber: true,
            orderStatus: true,
            updatedAt: true,
          },
        },
      },
    })

    if (!line) {
      throw httpError(
        'Delivered product not found for review',
        404,
        'NotFound',
      )
    }
    return line
  }
}

export default new BuyerReviewsService()
