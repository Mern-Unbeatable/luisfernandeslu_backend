import { z } from 'zod'

export const supplierOverviewQuerySchema = z.object({
  period: z.coerce.number().int().min(2000).max(2100).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(7),
})
