import { z } from 'zod'

const uuid = z.string().uuid('Invalid id')
const positiveNumber = z.coerce.number().positive()
const nonNegativeNumber = z.coerce.number().min(0)
const uuidList = z.array(uuid).optional().default([])

export const promoCodeIdParamSchema = z.object({
  id: uuid,
})

export const listPromoCodesQuerySchema = z.object({
  status: z
    .enum(['all', 'active', 'disabled', 'expired'])
    .optional()
    .default('all'),
  /**
   * all — every promo code
   * product — only promos linked to one or more specific products
   * catalog — only promos linked to category/sub/type (no product links)
   */
  scope: z.enum(['all', 'product', 'catalog']).optional().default('all'),
  /** Optional: only promos that include this productId */
  productId: uuid.optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().trim().optional(),
})

const promoCodeFieldsSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Promo code is required')
    .max(40)
    .transform((v) => v.toUpperCase().replace(/\s+/g, '')),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
  discountValue: positiveNumber,
  minOrderAmount: nonNegativeNumber.optional().default(0),
  expiryDate: z.coerce.date(),
  usageLimit: z.coerce.number().int().positive().optional().nullable(),
  unlimited: z.boolean().optional().default(false),
  applicableUsers: z
    .enum(['ALL', 'CUSTOMER', 'COMPANY'])
    .optional()
    .default('ALL'),
  /** Root categories */
  categoryIds: uuidList,
  /** Subcategories */
  subCategoryIds: uuidList,
  /** Product types (leaf) */
  productTypeIds: uuidList,
  /** Individual products */
  productIds: uuidList,
})

function hasCatalogOrProductScope(data) {
  return Boolean(
    data.categoryIds?.length ||
      data.subCategoryIds?.length ||
      data.productTypeIds?.length ||
      data.productIds?.length,
  )
}

function refinePromoCode(data, ctx, { requireScope }) {
  if (
    data.discountType === 'PERCENTAGE' &&
    data.discountValue != null &&
    data.discountValue > 100
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['discountValue'],
      message: 'Percentage discount cannot exceed 100',
    })
  }
  if (
    data.expiryDate instanceof Date &&
    !Number.isNaN(data.expiryDate.getTime()) &&
    data.expiryDate.getTime() < Date.now() - 60_000
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['expiryDate'],
      message: 'Expiry date must be in the future',
    })
  }
  if (data.unlimited === false && !(data.usageLimit > 0)) {
    ctx.addIssue({
      code: 'custom',
      path: ['usageLimit'],
      message: 'Usage limit must be greater than 0 when Unlimited is off',
    })
  }
  if (requireScope && !hasCatalogOrProductScope(data)) {
    ctx.addIssue({
      code: 'custom',
      path: ['productIds'],
      message:
        'Select at least one product, category, subcategory, or product type',
    })
  }
}

export const createPromoCodeBodySchema = promoCodeFieldsSchema.superRefine(
  (data, ctx) => refinePromoCode(data, ctx, { requireScope: true }),
)

export const updatePromoCodeBodySchema = promoCodeFieldsSchema
  .partial()
  .superRefine((data, ctx) => {
    refinePromoCode(data, ctx, { requireScope: false })
    const scopeTouched =
      data.productIds !== undefined ||
      data.categoryIds !== undefined ||
      data.subCategoryIds !== undefined ||
      data.productTypeIds !== undefined
    if (scopeTouched && !hasCatalogOrProductScope(data)) {
      ctx.addIssue({
        code: 'custom',
        path: ['productIds'],
        message:
          'Select at least one product, category, subcategory, or product type',
      })
    }
  })

export const promoCodeStatusBodySchema = z.object({
  isActive: z.boolean(),
})
