import { z } from 'zod'

const statusFilter = z
  .enum(['all', 'active', 'suspended', 'ACTIVE', 'SUSPENDED'])
  .optional()
  .default('all')

export const adminAffiliateIdParamSchema = z.object({
  id: z.string().trim().min(1),
})

export const adminPayoutIdParamSchema = z.object({
  payoutId: z.string().trim().min(1),
})

export const listAdminAffiliatesQuerySchema = z.object({
  status: statusFilter,
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(7),
})

export const updateAdminAffiliateStatusBodySchema = z.object({
  status: z.enum(['active', 'suspended', 'ACTIVE', 'SUSPENDED']),
})

export const listAffiliateClientsQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: statusFilter,
  plan: z
    .enum(['all', 'customer', 'company', 'CUSTOMER', 'COMPANY'])
    .optional()
    .default('all'),
  sort: z.enum(['latest', 'oldest']).optional().default('latest'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(7),
})

export const affiliateAnalyticsQuerySchema = z.object({
  period: z.enum(['thisYear', 'this_year']).optional().default('thisYear'),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})

export const listAffiliateCommissionsQuerySchema = z.object({
  status: z
    .enum(['all', 'pending', 'approved', 'rejected', 'PENDING', 'CLEARED', 'REJECTED'])
    .optional()
    .default('all'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(7),
})

export const listAffiliatePayoutsQuerySchema = z.object({
  status: z
    .enum([
      'all',
      'pending',
      'approved',
      'paid',
      'rejected',
      'PENDING',
      'PROCESSING',
      'COMPLETED',
      'REJECTED',
    ])
    .optional()
    .default('all'),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(7),
})

export const updatePayoutStatusBodySchema = z.object({
  status: z.enum([
    'paid',
    'approved',
    'rejected',
    'pending',
    'PAID',
    'APPROVED',
    'REJECTED',
    'PENDING',
    'COMPLETED',
    'PROCESSING',
  ]),
})
