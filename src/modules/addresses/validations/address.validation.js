import { z } from 'zod'

const uuid = z.string().uuid('Invalid id')

export const addressIdParamSchema = z.object({
  id: uuid,
})

const addressFields = {
  title: z.string().trim().max(120).optional().nullable(),
  streetAddress: z.string().trim().min(1, 'Street address is required').max(500),
  city: z.string().trim().min(1, 'City is required').max(120),
  state: z.string().trim().min(1, 'Region/State is required').max(120),
  zipCode: z.string().trim().min(1, 'Zip code is required').max(32),
  country: z.string().trim().min(1).max(120).default('Portugal'),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
}

export const createAddressBodySchema = z.object({
  ...addressFields,
  addressType: z.enum(['BILLING', 'SHIPPING', 'WAREHOUSE']).default('SHIPPING'),
  isDefault: z.boolean().optional().default(false),
})

export const updateAddressBodySchema = z
  .object({
    title: z.string().trim().max(120).optional().nullable(),
    streetAddress: z.string().trim().min(1).max(500).optional(),
    city: z.string().trim().min(1).max(120).optional(),
    state: z.string().trim().min(1).max(120).optional(),
    zipCode: z.string().trim().min(1).max(32).optional(),
    country: z.string().trim().min(1).max(120).optional(),
    latitude: z.coerce.number().optional().nullable(),
    longitude: z.coerce.number().optional().nullable(),
    addressType: z.enum(['BILLING', 'SHIPPING', 'WAREHOUSE']).optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  })
