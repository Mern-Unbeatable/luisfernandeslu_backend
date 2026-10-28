import { Router } from 'express'
import { z } from 'zod'
import controller from './supplier-delivery.controller.js'
import { validate } from '../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../middlewares/auth.middleware.js'

const orderIdParamSchema = z.object({ orderId: z.string().uuid() })

/** Mounted at `/api/supplier/deliveries`. */
export const supplierDeliveryRoutes = Router()
supplierDeliveryRoutes.use(requireAccessToken, requireRoles('supplier'))
supplierDeliveryRoutes.get('/', (req, res, next) => controller.list(req, res, next))
supplierDeliveryRoutes.post(
  '/:orderId/self',
  validate(orderIdParamSchema, 'params'),
  (req, res, next) => controller.chooseSelf(req, res, next),
)
supplierDeliveryRoutes.post(
  '/:orderId/carrier',
  validate(orderIdParamSchema, 'params'),
  (req, res, next) => controller.chooseCarrier(req, res, next),
)
supplierDeliveryRoutes.post(
  '/:orderId/delivered',
  validate(orderIdParamSchema, 'params'),
  (req, res, next) => controller.markDelivered(req, res, next),
)

/** Mounted at `/api/admin/self-deliveries`. */
export const adminSelfDeliveryRoutes = Router()
adminSelfDeliveryRoutes.use(requireAccessToken, requireRoles('admin'))
adminSelfDeliveryRoutes.get('/', (req, res, next) => controller.listForAdmin(req, res, next))
