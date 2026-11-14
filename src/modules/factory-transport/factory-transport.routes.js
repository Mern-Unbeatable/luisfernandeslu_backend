import { Router } from 'express'
import { z } from 'zod'
import controller from './factory-transport.controller.js'
import { validate } from '../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../middlewares/auth.middleware.js'
import { vehicleTypeEnum } from '../auctions/validations/auction.validation.js'

const orderIdParamSchema = z.object({ orderId: z.string().uuid() })

const transportChoiceBodySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('PLATFORM'), requiredVehicleType: vehicleTypeEnum }),
  z.object({ mode: z.literal('SELF') }),
])

const transportPayBodySchema = z
  .object({
    paymentMethod: z.enum(['multibanco', 'mbway', 'creditcard']).default('multibanco'),
    mbwayPhone: z.string().trim().min(9).max(20).optional(),
  })
  .refine((b) => b.paymentMethod !== 'mbway' || Boolean(b.mbwayPhone), {
    message: 'MB WAY phone is required',
    path: ['mbwayPhone'],
  })

/** Mounted at `/api/factory/transport`. */
export const factoryTransportRoutes = Router()
factoryTransportRoutes.use(requireAccessToken, requireRoles('factory'))
factoryTransportRoutes.post(
  '/:orderId',
  validate(orderIdParamSchema, 'params'),
  validate(transportChoiceBodySchema),
  (req, res, next) => controller.chooseTransport(req, res, next),
)
factoryTransportRoutes.post(
  '/:orderId/delivered',
  validate(orderIdParamSchema, 'params'),
  (req, res, next) => controller.markDelivered(req, res, next),
)

/** Mounted at `/api/supplier/transport-payments`. */
export const supplierTransportPaymentRoutes = Router()
supplierTransportPaymentRoutes.use(requireAccessToken, requireRoles('supplier'))
supplierTransportPaymentRoutes.get('/', (req, res, next) => controller.listForSupplier(req, res, next))
supplierTransportPaymentRoutes.post(
  '/:orderId/pay',
  validate(orderIdParamSchema, 'params'),
  validate(transportPayBodySchema),
  (req, res, next) => controller.payForSupplier(req, res, next),
)
