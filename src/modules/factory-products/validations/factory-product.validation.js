import { z } from 'zod'

const uuid = z.string().uuid('Invalid id')
const positiveNumber = z.coerce.number().positive()
const nonNegativeNumber = z.coerce.number().min(0)

export const factoryProductIdParamSchema = z.object({
  id: uuid,
})

export const factoryListQuerySchema = z.object({
  tab: z
    .enum(['all', 'active', 'pending', 'rejected'])
    .optional()
    .default('all'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(12),
  categoryId: uuid.optional(),
  category: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
})

export const factoryAiBodySchema = z.object({
  title: z.string().trim().min(2, 'Title is required'),
  field: z.enum([
    'description',
    'feature',
    'additionalInfo',
    'specifications',
  ]),
})

/** Multipart create — no inventory / quantity */
export const factoryCreateBodySchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required'),
  title: z.string().trim().min(2, 'Title is required'),
  warehouseLocation: z.string().trim().min(1, 'Warehouse location is required'),
  categoryId: uuid,
  subCategoryId: uuid,
  productTypeId: uuid,
  basePrice: positiveNumber,
  weightKg: nonNegativeNumber.optional().default(0),
  description: z.string().trim().optional().default(''),
  feature: z.string().trim().optional().default(''),
  additionalInfo: z.string().trim().optional().default(''),
  specifications: z.string().trim().optional().default(''),
})

/** Edit — category path locked */
export const factoryEditBodySchema = z.object({
  title: z.string().trim().min(2, 'Title is required'),
  warehouseLocation: z.string().trim().min(1, 'Warehouse location is required'),
  basePrice: positiveNumber,
  weightKg: nonNegativeNumber.optional().default(0),
  description: z.string().trim().optional().default(''),
  feature: z.string().trim().optional().default(''),
  additionalInfo: z.string().trim().optional().default(''),
  specifications: z.string().trim().optional().default(''),
})
