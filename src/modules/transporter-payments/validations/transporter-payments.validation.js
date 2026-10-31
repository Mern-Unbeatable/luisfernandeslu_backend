import { z } from 'zod'

function parseAmount(raw) {
  if (typeof raw === 'number') return raw
  const cleaned = String(raw || '')
    .replace(/[^\d.,-]/g, '')
    .replace(',', '.')
  return Number(cleaned)
}

export const listTransporterPaymentsQuerySchema = z.object({
  period: z
    .union([
      z.enum(['thisYear', 'lastYear']),
      z.coerce.number().int().min(2000).max(2100),
    ])
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const withdrawTransporterFundsBodySchema = z
  .object({
    amount: z.preprocess(parseAmount, z.number().positive()),
    businessName: z.string().trim().optional(),
    routingNumber: z.string().trim().optional(),
    accountNumber: z.string().trim().min(5).optional(),
    iban: z.string().trim().min(5).optional(),
  })
  .refine((b) => b.accountNumber || b.iban, {
    message: 'IBAN is required',
  })
