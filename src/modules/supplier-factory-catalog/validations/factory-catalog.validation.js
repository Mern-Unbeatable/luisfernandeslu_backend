import { z } from 'zod'

const uuid = z.string().uuid('Invalid product id')

export const productIdParamSchema = z.object({
  id: uuid,
})

export const listFactoryCatalogQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(12),
  search: z.string().trim().max(200).optional().default(''),
  factoryId: z.string().trim().max(100).optional().default(''),
})
