import { z } from 'zod'

export const adminFactoryIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Invalid id'),
})

export const listAdminFactoriesQuerySchema = z.object({
  status: z
    .enum(['all', 'pending', 'suspended', 'ALL', 'PENDING', 'SUSPENDED'])
    .optional()
    .default('all'),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export const updateAdminFactoryStatusBodySchema = z.object({
  status: z.enum(['active', 'suspended', 'ACTIVE', 'SUSPENDED']),
})

export const updateAdminFactoryCommissionBodySchema = z.object({
  commissionPercent: z.coerce.number().min(0).max(100),
})

export const rejectAdminFactoryBodySchema = z.object({
  reason: z.string().trim().min(3, 'Reason is required'),
  invalidDocuments: z
    .array(
      z.enum([
        'companyCertificateUrl',
        'commercialRegistrationUrl',
        'nifDocumentUrl',
        'idDocumentUrl',
        'addressProofUrl',
        'ibanProofUrl',
      ]),
    )
    .optional()
    .default([]),
})
