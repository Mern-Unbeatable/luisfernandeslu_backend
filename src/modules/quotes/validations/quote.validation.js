import { z } from 'zod'

const uuid = z.string().uuid('Invalid id')

export const sendQuoteBodySchema = z.object({
  budget: z.coerce.number().positive('Budget must be greater than 0'),
  quantity: z.string().trim().min(1, 'Quantity is required').max(120),
  message: z.string().trim().max(2000).optional().default(''),
})

export const quoteIdParamSchema = z.object({
  id: uuid,
})

export const offerIdParamSchema = z.object({
  id: uuid,
  offerId: uuid,
})

export const listQuotesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(12),
  status: z
    .enum(['all', 'PENDING', 'IN_CHAT', 'ACCEPTED', 'REJECTED'])
    .optional()
    .default('all'),
})

export const listMessagesQuerySchema = z.object({
  after: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
})

export const sendMessageBodySchema = z.object({
  message: z.string().trim().min(1, 'Message is required').max(4000),
})

const installmentSchema = z.object({
  price: z.coerce.number().positive('Installment price must be > 0'),
  quantity: z.coerce.number().positive('Installment quantity must be > 0'),
})

/** Supplier Create Offer Card modal (supports UI field aliases) */
export const createOfferBodySchema = z
  .object({
    warehouseLocation: z.string().trim().optional(),
    warehouse: z.string().trim().optional(),
    productId: uuid.optional(),
    productName: z.string().trim().optional(),
    product: z.string().trim().optional(),
    totalQuantity: z.coerce.number().positive('Total quantity is required'),
    quantityUnit: z.string().trim().optional().default('bags'),
    projectName: z.string().trim().min(1, 'Project name is required'),
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
