import { z } from 'zod'

const uuid = z.string().uuid('Invalid id')
const positiveNumber = z.coerce.number().positive()
const nonNegativeNumber = z.coerce.number().min(0)

function parseJsonField(value, label) {
  if (value == null || value === '') return undefined
  if (typeof value === 'object') return value
  try {
    return JSON.parse(String(value))
  } catch {
    throw new Error(`Invalid JSON for ${label}`)
  }
}

const bulkTierSchema = z
  .array(
    z.object({
      minQuantity: z.coerce.number().int().positive(),
      maxQuantity: z.coerce.number().int().positive().optional().nullable(),
      price: z.coerce.number().positive(),
    }),
  )
  .optional()
  .default([])

export const skuLookupQuerySchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required'),
})

export const productIdParamSchema = z.object({
  id: uuid,
})

export const aiGenerateBodySchema = z.object({
  title: z.string().trim().min(2, 'Title is required'),
  field: z.enum([
    'description',
    'feature',
    'additionalInfo',
    'specifications',
  ]),
})

/** Multipart body — numbers arrive as strings. */
export const createProductBodySchema = z
  .object({
    sku: z.string().trim().min(1, 'SKU is required'),
    title: z.string().trim().min(2, 'Title is required'),
    warehouseLocation: z.string().trim().min(1, 'Warehouse location is required'),
    categoryId: uuid,
    subCategoryId: uuid,
    productTypeId: uuid,
    quantity: positiveNumber,
    basePrice: positiveNumber,
    b2bDiscount: nonNegativeNumber.optional().default(0),
    minB2bQuantity: z.coerce.number().int().positive().optional().nullable(),
    weightKg: nonNegativeNumber.optional().default(0),
    description: z.string().trim().optional().default(''),
    feature: z.string().trim().optional().default(''),
    additionalInfo: z.string().trim().optional().default(''),
    specifications: z.string().trim().optional().default(''),
    bulkEnabled: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((v) => {
        if (typeof v === 'boolean') return v
        if (v == null || v === '') return false
        return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase())
      }),
    bulkOptions: z.preprocess(
      (v) => {
        try {
          return parseJsonField(v, 'bulkOptions') ?? []
        } catch {
          return v
        }
      },
      bulkTierSchema,
    ),
    factoryName: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.bulkEnabled) return
    if (!data.bulkOptions?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['bulkOptions'],
        message: 'Add at least one bulk option when bulk is enabled',
      })
    }
  })

/**
 * Edit Product — SKU / category / subcategory / product type are locked.
 */
export const editProductBodySchema = z
  .object({
    title: z.string().trim().min(2, 'Title is required'),
    warehouseLocation: z.string().trim().min(1, 'Warehouse location is required'),
    quantity: positiveNumber,
    basePrice: positiveNumber,
    b2bDiscount: nonNegativeNumber.optional().default(0),
    minB2bQuantity: z.coerce.number().int().positive().optional().nullable(),
    weightKg: nonNegativeNumber.optional().default(0),
    description: z.string().trim().optional().default(''),
    feature: z.string().trim().optional().default(''),
    additionalInfo: z.string().trim().optional().default(''),
    specifications: z.string().trim().optional().default(''),
    bulkEnabled: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((v) => {
        if (typeof v === 'boolean') return v
        if (v == null || v === '') return false
        return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase())
      }),
    bulkOptions: z.preprocess(
      (v) => {
        try {
          return parseJsonField(v, 'bulkOptions') ?? []
        } catch {
          return v
        }
      },
      bulkTierSchema,
    ),
    factoryName: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.bulkEnabled) return
    if (!data.bulkOptions?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['bulkOptions'],
        message: 'Add at least one bulk option when bulk is enabled',
      })
    }
  })
