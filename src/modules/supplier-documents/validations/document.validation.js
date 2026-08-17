import { z } from 'zod'

export const documentIdParamSchema = z.object({
  id: z.string().uuid('Invalid document id'),
})

export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  search: z.string().trim().max(200).optional().default(''),
})

export const eligibleOrdersQuerySchema = z.object({
  search: z.string().trim().max(200).optional().default(''),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
})

export const generateDocumentBodySchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
})

export const downloadQuerySchema = z.object({
  audience: z
    .enum(['SUPPLIER', 'CUSTOMER', 'supplier', 'customer'])
    .optional()
    .default('SUPPLIER'),
})
