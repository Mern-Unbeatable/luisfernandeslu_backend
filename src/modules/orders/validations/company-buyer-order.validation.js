import { z } from 'zod'

export const companyOrderIdParamSchema = z.object({
  orderId: z.string().trim().min(3, 'Invalid orderId'),
})

export const listCompanyOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.string().trim().optional(),
})
