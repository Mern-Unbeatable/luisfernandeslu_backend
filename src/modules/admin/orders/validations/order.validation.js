import { z } from 'zod'

export const adminOrderIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Invalid id'),
})

/** Supplier + factory status values (tab decides which apply). */
const listStatusEnum = z.enum([
  'all',
  'ALL',
  // supplier order filters
  'new',
  'pending',
  'processing',
  'assigned',
  'completed',
  'cancel',
  'cancelled',
  'NEW',
  'PENDING',
  'PROCESSING',
  'ASSIGNED',
  'COMPLETED',
  'CANCEL',
  'CANCELLED',
  // factory order filters
  'in_production',
  'inproduction',
  'in-production',
  'IN_PRODUCTION',
  'produced',
  'PRODUCED',
  'ready',
  'READY',
])

export const listAdminOrdersQuerySchema = z.object({
  tab: z
    .enum(['supplier', 'factory', 'SUPPLIER', 'FACTORY'])
    .optional()
    .default('supplier'),
  /** Only for tab=supplier. Ignored for factory orders. */
  customerType: z
    .enum(['all', 'customer', 'company', 'ALL', 'CUSTOMER', 'COMPANY'])
    .optional()
    .default('all'),
  status: listStatusEnum.optional().default('all'),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export const updateAdminOrderStatusBodySchema = z.object({
  status: z.enum([
    // supplier
    'new',
    'pending',
    'processing',
    'assigned',
    'completed',
    'cancel',
    'cancelled',
    'NEW',
    'PENDING',
    'PROCESSING',
    'ASSIGNED',
    'COMPLETED',
    'CANCEL',
    'CANCELLED',
    // factory
    'in_production',
    'inproduction',
    'in-production',
    'IN_PRODUCTION',
    'produced',
    'PRODUCED',
    'ready',
    'READY',
  ]),
  reason: z.string().trim().min(2).max(2000).optional(),
})
