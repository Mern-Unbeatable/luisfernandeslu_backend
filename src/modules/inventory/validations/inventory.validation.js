import { z } from 'zod'

const uuid = z.string().uuid('Invalid id')
const positiveNumber = z.coerce.number().positive('Must be greater than 0')

export const inventoryIdParamSchema = z.object({
  id: uuid,
})

export const listInventoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().optional(),
})

export const createInventoryBodySchema = z.object({
  warehouseLocation: z.string().trim().min(1, 'Warehouse location is required'),
  categoryId: uuid.optional(),
  subCategoryId: uuid.optional(),
  productTypeId: uuid.optional(),
  categoryName: z.string().trim().min(1).optional(),
  subCategoryName: z.string().trim().min(1).optional(),
  productTypeName: z.string().trim().min(1).optional(),
  name: z.string().trim().min(2, 'Product name is required'),
  sku: z.string().trim().min(1, 'SKU is required'),
  quantity: positiveNumber,
  price: positiveNumber,
  factoryName: z.string().trim().min(1, 'Factory name is required'),
}).superRefine((data, ctx) => {
  const hasIds = Boolean(data.categoryId && data.subCategoryId && data.productTypeId)
  const hasNames = Boolean(
    data.categoryName && data.subCategoryName && data.productTypeName,
  )

  if (!hasIds && !hasNames) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'Provide either categoryId/subCategoryId/productTypeId or categoryName/subCategoryName/productTypeName',
      path: ['categoryId'],
    })
  }
})

export const restockBodySchema = z.object({
  quantity: positiveNumber,
})
