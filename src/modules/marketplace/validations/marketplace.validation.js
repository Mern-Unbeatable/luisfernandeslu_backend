import { z } from 'zod'

const uuid = z.string().uuid('Invalid id')

export const marketplaceListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(12),
  categoryId: uuid.optional(),
  category: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
  sponsored: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => {
      if (v == null) return undefined
      return v === 'true' || v === '1'
    }),
})

export const marketplaceProductIdParamSchema = z.object({
  id: uuid,
})
