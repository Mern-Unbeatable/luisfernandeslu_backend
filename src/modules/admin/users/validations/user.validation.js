import { z } from 'zod'

export const adminUserIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Invalid id'),
})

export const listAdminUsersQuerySchema = z.object({
  type: z.enum(['customer', 'company', 'CUSTOMER', 'COMPANY']).default('customer'),
  status: z
    .enum(['all', 'active', 'suspended', 'ACTIVE', 'SUSPENDED', 'All Status'])
    .optional()
    .default('all'),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export const updateAdminUserStatusBodySchema = z.object({
  status: z.enum(['active', 'suspended', 'ACTIVE', 'SUSPENDED']),
})

export const adminUserMessageBodySchema = z.object({
  message: z.string().trim().min(1, 'Message is required'),
})

export const listAdminUserMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
})
