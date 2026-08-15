import { z } from 'zod'

const uuid = z.string().uuid('Invalid id')
const positiveNumber = z.coerce.number().positive('Must be greater than 0')
const nonNegativeNumber = z.coerce.number().min(0, 'Must be 0 or greater')

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
  categoryId: uuid,
  subCategoryId: uuid,
  productTypeId: uuid,
  name: z.string().trim().min(2, 'Product name is required'),
  sku: z.string().trim().min(1, 'SKU is required'),
  quantity: positiveNumber,
  price: positiveNumber,
  factoryName: z.string().trim().min(1, 'Factory name is required'),
  unitOfMeasure: z.string().trim().optional().default('tons'),
  lowStockThreshold: nonNegativeNumber.optional().default(10),
})

export const restockBodySchema = z.object({
  quantity: positiveNumber,
})
