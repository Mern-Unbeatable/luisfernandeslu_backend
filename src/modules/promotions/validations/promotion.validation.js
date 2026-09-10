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
    .preprocess(
      (v) => (v === '' || v == null ? 'all' : v),
      z.enum([
        'all',
        'pending',
        'active',
        'featured',
        'completed',
        'rejected',
        'ALL',
        'PENDING',
        'ACTIVE',
        'FEATURED',
        'COMPLETED',
        'REJECTED',
      ]),
    )
    .optional()
    .default('pending'),
  /** Optional extra filter on product.isFeatured (true|false). Empty ignored. */
  featured: z
    .preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z
        .union([
          z.boolean(),
          z.enum(['true', 'false', '1', '0', 'yes', 'no']),
        ])
        .optional(),
    )
    .transform((v) => {
      if (v == null) return undefined
      if (typeof v === 'boolean') return v
      const s = String(v).toLowerCase()
      if (['true', '1', 'yes'].includes(s)) return true
      if (['false', '0', 'no'].includes(s)) return false
      return undefined
    }),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(12),
  search: z.string().trim().optional(),
})

export const adminModeratePromotionBodySchema = z.object({
  status: z.enum([
    'approved',
    'rejected',
    'removed',
    'APPROVED',
    'REJECTED',
    'REMOVED',
  ]),
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
  currency: z.string().trim().min(3).max(8).optional().default('EUR'),
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
