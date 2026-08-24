import { z } from 'zod'
import { optionalUrlList } from '../../../shared/upload/evidence-upload.js'

const uuid = z.string().uuid('Invalid id')

export const deliveryIdParamSchema = z.object({
  id: uuid,
})

export const buyerOrderIdParamSchema = z.object({
  orderId: z.string().trim().min(3, 'Invalid orderId'),
})

export const listDeliveriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.string().trim().optional(),
})

export const updateDeliveryStatusBodySchema = z.object({
  action: z.enum([
    'START_TRIP',
    'MARK_PICKED_UP',
    'NAVIGATE_TO_DELIVERY',
    'VERIFY_DELIVERY',
    'start_trip',
    'mark_picked_up',
    'navigate_to_delivery',
    'verify_delivery',
  ]),
})

export const verifyDeliveryOtpBodySchema = z.object({
  otp: z.coerce.string().trim().regex(/^\d{4}$/, 'OTP must be 4 digits'),
  proof: z
    .preprocess(optionalUrlList, z.array(z.string().trim().min(1)).max(10))
    .optional(),
})
