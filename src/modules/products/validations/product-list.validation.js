import { z } from 'zod'

const uuid = z.string().uuid('Invalid id')

export const listProductsQuerySchema = z.object({
  tab: z
    .enum(['all', 'pending', 'rejected', 'regular', 'bulk', 'featured'])
    .optional()
    .default('all'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(1000).optional().default(12),
  /** Root / sub / product-type UUID — matches any level of the catalog path */
  categoryId: uuid.optional(),
  /** Optional display name (case-insensitive), resolved to categoryId */
  category: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
})

export const adminListProductsQuerySchema = z.object({
  status: z
    .enum(['all', 'DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'])
    .optional()
    .default('PENDING_REVIEW'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(12),
  /** Root / sub / product-type UUID — matches any level of the catalog path */
  categoryId: uuid.optional(),
  /** Optional display name (case-insensitive), resolved to categoryId */
  category: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
})

export const adminModerateProductBodySchema = z.object({
  status: z.enum(['approved', 'rejected', 'APPROVED', 'REJECTED']),
  reason: z.string().trim().min(2).max(2000).optional(),
})

/** @deprecated use adminModerateProductBodySchema */
export const adminRejectBodySchema = z.object({
  reason: z.string().trim().min(2).max(2000).optional(),
})
