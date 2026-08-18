import { z } from 'zod'

const uuid = z.string().uuid('Invalid order id')

export const orderIdParamSchema = z.object({
  id: uuid,
})

const statusFilter = z
  .enum([
    'all',
    'new',
    'pending',
    'processing',
    'assigned',
    'cancel',
    'cancelled',
    'completed',
    'NEW',
    'PENDING',
    'PROCESSING',
    'ASSIGNED',
    'CANCELLED',
    'COMPLETED',
  ])
  .optional()
  .default('all')

export const statsQuerySchema = z.object({
  type: z.enum(['direct', 'chat']).optional().default('direct'),
})

export const listCompanyOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  status: statusFilter,
  search: z.string().trim().max(200).optional().default(''),
  companyId: z.string().trim().max(100).optional().default(''),
})

export const updateOrderStatusBodySchema = z
  .object({
    status: z.enum([
      'PENDING',
      'PROCESSING',
      'CANCELLED',
      'pending',
      'processing',
      'cancel',
      'cancelled',
      'accept',
    ]),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    const s = String(data.status).toUpperCase()
    const isCancel = s === 'CANCELLED' || s === 'CANCEL'
    if (isCancel && !data.reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cancellation reason is required',
        path: ['reason'],
      })
    }
  })
