import { z } from 'zod'

const vehicleIdSchema = z.enum([
  'crane-12',
  'crane-24',
  'tipper',
  'forklift',
  'manual',
])

export const saveShippingBodySchema = z.object({
  vehicleRates: z
    .array(
      z.object({
        id: vehicleIdSchema,
        perKmCharge: z.number().finite().min(0),
      }),
    )
    .min(1),
})

export const saveVatBodySchema = z.object({
  defaultRate: z.number().finite().min(0).max(100),
})

export const saveAuctionBodySchema = z.object({
  hours: z.number().int().min(0).max(999),
  minutes: z.number().int().min(0).max(59),
})
