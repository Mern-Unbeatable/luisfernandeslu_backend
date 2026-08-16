import { z } from 'zod'

const uuid = z.string().uuid('Invalid id')

export const cartItemIdParamSchema = z.object({
  id: uuid,
})

export const addCartItemBodySchema = z.object({
  productId: uuid,
  quantity: z.coerce.number().int().positive().optional().default(1),
})

export const updateCartItemBodySchema = z
  .object({
    quantity: z.coerce.number().int().positive().optional(),
    action: z.enum(['increase', 'decrease', 'set']).optional(),
  })
  .refine((data) => data.quantity != null || data.action != null, {
    message: 'Provide quantity and/or action (increase|decrease|set)',
  })

export const applyPromoBodySchema = z.object({
  code: z.string().trim().min(1, 'Promo code is required').max(64),
})

export const removePromoBodySchema = z.object({
  code: z.string().trim().min(1).max(64).optional(),
})
