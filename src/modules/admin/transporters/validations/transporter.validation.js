import { z } from 'zod'

export const adminTransporterIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Invalid id'),
})

export const adminTransporterInsuranceParamSchema = z.object({
  id: z.string().trim().min(1, 'Invalid id'),
  kind: z.enum(['civil', 'cargo', 'CIVIL', 'CARGO']),
})

export const listAdminTransportersQuerySchema = z.object({
  status: z
    .enum(['all', 'pending', 'suspended', 'ALL', 'PENDING', 'SUSPENDED'])
    .optional()
    .default('all'),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export const updateAdminTransporterStatusBodySchema = z.object({
  status: z.enum(['active', 'suspended', 'ACTIVE', 'SUSPENDED']),
})

export const updateAdminTransporterCommissionBodySchema = z.object({
  commissionPercent: z.coerce.number().min(0).max(100),
})

export const rejectAdminTransporterBodySchema = z.object({
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

export const rejectAdminInsuranceBodySchema = z.object({
  reason: z.string().trim().min(3, 'Reason is required').optional(),
})
