import { z } from 'zod'

const uuid = z.string().uuid('Invalid id')
const positiveNumber = z.coerce.number().positive()

export const promoteBodySchema = z.object({
  planId: uuid,
})

export const payPromotionBodySchema = z.object({
  paymentRef: z.string().trim().min(1).max(200).optional(),
})

export const adminPromotionListQuerySchema = z.object({
  status: z
    .enum([
      'all',
      'pending',
      'active',
      'completed',
      'rejected',
      'ALL',
      'PENDING',
      'ACTIVE',
      'COMPLETED',
      'REJECTED',
    ])
    .optional()
    .default('pending'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(12),
  search: z.string().trim().optional(),
})

export const adminModeratePromotionBodySchema = z.object({
  status: z.enum(['approved', 'rejected', 'APPROVED', 'REJECTED']),
  reason: z.string().trim().min(2).max(2000).optional(),
})

/** @deprecated use adminModeratePromotionBodySchema */
export const adminRejectPromotionBodySchema = z.object({
  reason: z.string().trim().min(2).max(2000).optional(),
})

export const upsertPlanBodySchema = z.object({
  label: z.string().trim().min(2).max(80),
  durationDays: z.coerce.number().int().positive(),
  price: positiveNumber,
  currency: z.string().trim().min(3).max(8).optional().default('USD'),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().optional().default(0),
})

export const updatePlanBodySchema = upsertPlanBodySchema.partial()

export const planIdParamSchema = z.object({
  id: uuid,
})

export const promotionIdParamSchema = z.object({
  id: uuid,
})

export const productIdParamSchema = z.object({
  id: uuid,
})

export const productPromotionParamsSchema = z.object({
  id: uuid,
  promotionId: uuid,
})
