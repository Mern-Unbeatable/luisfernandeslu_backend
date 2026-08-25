import { z } from 'zod'

export const tierIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const createTierBodySchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    levelName: z.string().trim().min(2).optional(),
    minActiveClients: z.coerce.number().int().min(0).optional(),
    membersRequired: z.coerce.number().int().min(0).optional(),
    commissionPercent: z.coerce.number().min(0).max(100),
    description: z.string().trim().max(500).optional(),
    sortOrder: z.coerce.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((b) => b.name || b.levelName, {
    message: 'name is required',
  })
  .refine((b) => b.minActiveClients != null || b.membersRequired != null, {
    message: 'membersRequired is required',
  })

export const updateTierBodySchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    levelName: z.string().trim().min(2).optional(),
    minActiveClients: z.coerce.number().int().min(0).optional(),
    membersRequired: z.coerce.number().int().min(0).optional(),
    commissionPercent: z.coerce.number().min(0).max(100).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    sortOrder: z.coerce.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: 'Provide at least one field to update',
  })

export const reorderTiersBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
})
