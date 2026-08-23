import { z } from 'zod'

export const supplierReturnIdParamSchema = z.object({
  returnId: z.string().trim().min(1),
})

export const updateSupplierReturnStatusBodySchema = z.object({
  status: z.enum([
    'pending',
    'under_review',
    'approved',
    'rejected',
    'item_received',
    'inspection_progress',
    'inspection_pass',
    'inspection_rejected',
  ]),
})
