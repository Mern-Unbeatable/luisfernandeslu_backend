import { z } from 'zod'

const uuid = z.string().uuid('Invalid id')
const orderRef = z.string().trim().min(3, 'Invalid orderId')

const VEHICLE_TYPES = [
  'HEAVY_TRUCK',
  'FLATBED',
  'TIPPER',
  'CRANE_TRUCK',
  'VAN',
]

export const vehicleTypeEnum = z.enum(VEHICLE_TYPES)

export const auctionIdParamSchema = z.object({
  id: uuid,
})

export const auctionOrderIdParamSchema = z.object({
  orderId: orderRef,
})

export const listAuctionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  filter: z
    .enum([
      'all',
      'ending_soon',
      'nearest',
      'ended',
      'endingSoon',
      'nearestFirst',
      'ENDED',
      'ALL',
    ])
    .optional()
    .default('all'),
})

export const createAuctionBodySchema = z.object({
  orderId: orderRef,
  requiredVehicleType: vehicleTypeEnum,
})

export const createBidBodySchema = z.object({
  bidAmount: z.coerce.number().positive('Bid must be greater than 0'),
})
