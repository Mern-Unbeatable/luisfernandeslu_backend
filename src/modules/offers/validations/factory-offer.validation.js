import { z } from 'zod'

const uuid = z.string().uuid('Invalid id')
/** Better Auth user ids are cuid, not UUID. */
const userId = z
  .string()
  .trim()
  .min(8, 'Invalid id')
  .max(64, 'Invalid id')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid id')

const installmentSchema = z.object({
  price: z.coerce.number().positive('Installment price must be > 0'),
  quantity: z.coerce.number().positive('Installment quantity must be > 0'),
})

export const offerIdParamSchema = z.object({
  offerId: uuid,
})

export const threadIdParamSchema = z.object({
  threadId: uuid,
})

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(10),
})

export const listMessagesQuerySchema = z.object({
  after: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
})

/** Same fields as supplier → company offer card, plus who the offer is for. */
export const createFactoryOfferBodySchema = z
  .object({
    threadId: uuid.optional(),
    supplierId: userId,
    productId: uuid,
    warehouseLocation: z.string().trim().optional(),
    warehouse: z.string().trim().optional(),
    productName: z.string().trim().optional(),
    product: z.string().trim().optional(),
    totalQuantity: z.coerce.number().positive('Total quantity is required'),
    quantityUnit: z.string().trim().optional().default('bags'),
    projectName: z.string().trim().optional(),
    deliveryLocation: z.string().trim().min(1, 'Delivery location is required'),
    unloadingType: z.string().trim().min(1, 'Unloading type is required'),
    accessConditions: z.string().trim().min(1, 'Access conditions are required'),
    totalPrice: z.coerce.number().positive('Total price is required'),
    installmentMonths: z.coerce
      .number()
      .int()
      .positive('Installment months required'),
    installments: z
      .array(installmentSchema)
      .min(1, 'At least one installment is required')
      .max(24),
  })
  .transform((data) => ({
    ...data,
    warehouseLocation: (data.warehouseLocation || data.warehouse || '').trim(),
    productName: (data.productName || data.product || '').trim(),
  }))
  .superRefine((data, ctx) => {
    if (!data.warehouseLocation) {
      ctx.addIssue({
        code: 'custom',
        message: 'Warehouse location is required',
        path: ['warehouseLocation'],
      })
    }
    if (!data.productName && !data.productId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Product name is required',
        path: ['productName'],
      })
    }
  })
