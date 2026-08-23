import { z } from 'zod'
import { optionalUrlList } from '../../../shared/upload/evidence-upload.js'

export const buyerOrderIdParamSchema = z.object({
  orderId: z.string().trim().min(1),
})

export const buyerReturnIdParamSchema = z.object({
  returnId: z.string().trim().min(1),
})

export const createBuyerReturnBodySchema = z.object({
  orderId: z.string().trim().min(1),
  itemId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  damagedCount: z.string().trim().max(50).optional().default(''),
  refundAccount: z.string().trim().max(100).optional().default(''),
  evidence: z.preprocess(
    optionalUrlList,
    z.array(z.string().trim().min(1)).optional().default([]),
  ),
})
