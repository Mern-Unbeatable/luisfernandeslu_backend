import { z } from 'zod'

export const tierIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const createTierBodySchema = z.object({
  name: z.string().trim().min(2),
  minActiveClients: z.coerce.number().int().min(0),
  commissionPercent: z.coerce.number().min(0).max(100),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
})

export const updateTierBodySchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    minActiveClients: z.coerce.number().int().min(0).optional(),
    commissionPercent: z.coerce.number().min(0).max(100).optional(),
    sortOrder: z.coerce.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: 'Provide at least one field to update',
  })
