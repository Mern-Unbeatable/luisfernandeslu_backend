import { z } from 'zod'

const uuid = z.string().uuid('Invalid order id')

export const factoryOrderIdParamSchema = z.object({
  id: uuid,
})

export const listFactoryOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  status: z.string().trim().max(40).optional().default('all'),
  search: z.string().trim().max(200).optional().default(''),
  companyId: z.string().trim().max(100).optional().default(''),
  factoryId: z.string().trim().max(100).optional().default(''),
})

export const updateFactoryOrderStatusBodySchema = z.object({
  status: z.enum([
    'IN_PRODUCTION',
    'PRODUCED',
    'READY',
    'in_production',
    'in-production',
    'in production',
    'produced',
    'ready',
  ]),
})
