import { z } from 'zod'
import { optionalUrlList } from '../../../shared/upload/evidence-upload.js'

export const disputeIdParamSchema = z.object({
  disputeId: z.string().trim().min(1),
})

export const createDisputeBodySchema = z
  .object({
    orderNumber: z.string().trim().min(1).optional(),
    orderId: z.string().trim().min(1).optional(),
    issueType: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(4000),
    evidence: z.preprocess(
      optionalUrlList,
      z.array(z.string().trim().min(1)).optional().default([]),
    ),
    itemIds: z.preprocess(
      optionalUrlList,
      z.array(z.string().trim().min(1)).optional().default([]),
    ),
  })
  .refine((data) => data.orderNumber || data.orderId, {
    message: 'orderNumber is required',
    path: ['orderNumber'],
  })

export const updateDisputeStatusBodySchema = z.object({
  status: z.enum(['pending', 'under_review', 'resolved']),
})
