import { z } from 'zod'

export const adminLogisticsIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Invalid id'),
})

export const listAdminLogisticsQuerySchema = z.object({
  status: z
    .enum([
      'all',
      'assigned',
      'picked_up',
      'pickup',
      'in_transit',
      'delivered',
      'completed',
      'ALL',
      'ASSIGNED',
      'PICKED_UP',
      'IN_TRANSIT',
      'DELIVERED',
      'COMPLETED',
    ])
    .optional()
    .default('all'),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})
