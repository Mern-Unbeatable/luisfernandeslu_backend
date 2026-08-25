import { z } from 'zod'

export const insuranceKindParamSchema = z.object({
  kind: z.enum(['civil', 'cargo']),
})

function parseCoverage(raw) {
  if (typeof raw === 'number') return raw
  const cleaned = String(raw || '').replace(/[^\d.]/g, '')
  return Number(cleaned)
}

export const saveInsuranceBodySchema = z
  .object({
    type: z.enum(['civil', 'cargo']).optional(),
    insuranceType: z.enum(['civil', 'cargo']).optional(),
    provider: z.string().trim().min(2),
    policyNumber: z.string().trim().min(3),
    coverageAmount: z.preprocess(parseCoverage, z.number().positive()),
    startDate: z.string().trim().min(4).optional(),
    expiryDate: z.string().trim().min(4),
  })
  .refine((b) => b.type || b.insuranceType, {
    message: 'type is required',
    path: ['type'],
  })
