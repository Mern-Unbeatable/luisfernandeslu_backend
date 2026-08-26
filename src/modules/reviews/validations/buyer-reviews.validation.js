import { z } from 'zod'

export const pendingReviewIdParamSchema = z.object({
  id: z.string().uuid('Invalid review item id'),
})

export const listPendingReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export const createBuyerReviewBodySchema = z
  .object({
    orderLineItemId: z.string().uuid('Invalid orderLineItemId'),
    rating: z.coerce.number().int().min(1).max(5),
    comment: z.string().trim().max(2000).optional(),
    review: z.string().trim().max(2000).optional(),
  })
  .transform((body) => ({
    orderLineItemId: body.orderLineItemId,
    rating: body.rating,
    comment: (body.comment ?? body.review ?? '').trim() || null,
  }))
