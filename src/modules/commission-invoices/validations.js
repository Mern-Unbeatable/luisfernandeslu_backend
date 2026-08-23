import { z } from 'zod'

export const listCommissionInvoicesQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(7),
})

export const commissionInvoiceIdParamSchema = z.object({
  invoiceId: z.string().trim().min(1),
})
