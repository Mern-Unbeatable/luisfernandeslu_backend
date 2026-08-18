import { z } from 'zod'

export const apiKeyIdParamSchema = z.object({
  id: z.string().uuid('Invalid id'),
})

export const createApiKeyBodySchema = z.object({
  name: z.string().trim().min(2).max(60),
  // Optional string — can be used later for fine-grained permissions.
  permissions: z.string().trim().max(200).optional(),
  expiresAt: z
    .string()
    .datetime({ message: 'expiresAt must be ISO datetime' })
    .optional(),
})

