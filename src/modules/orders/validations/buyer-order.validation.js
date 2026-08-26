import { z } from 'zod'

export const buyerOrderIdParamSchema = z.object({
  orderId: z.string().trim().min(3, 'Invalid orderId'),
})

export const listBuyerOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.string().trim().optional(),
})

export const cancelBuyerOrderBodySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Cancellation reason is required')
    .max(500, 'Reason is too long'),
})
