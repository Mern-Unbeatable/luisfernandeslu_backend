import { z } from 'zod'

export const listProjectsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().optional(),
})

export const projectSuggestionsQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
})

export const projectIdParamSchema = z.object({
  projectId: z.string().uuid('Invalid projectId'),
})

export const projectOrderParamsSchema = z.object({
  projectId: z.string().uuid('Invalid projectId'),
  orderId: z.string().trim().min(3, 'Invalid orderId'),
})

export const projectOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})
