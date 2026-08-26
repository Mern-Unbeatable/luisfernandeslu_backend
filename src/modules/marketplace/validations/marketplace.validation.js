import { z } from 'zod'

const uuid = z.string().uuid('Invalid id')

const paginationQuery = {
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(12),
}

export const marketplaceListQuerySchema = z.object({
  ...paginationQuery,
  categoryId: uuid.optional(),
  category: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
  minPrice: z.coerce.number().finite().min(0).optional(),
  maxPrice: z.coerce.number().finite().min(0).optional(),
})

export const marketplaceSimpleListQuerySchema = z.object({
  ...paginationQuery,
})

export const marketplaceProductSlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, 'Invalid slug'),
})
