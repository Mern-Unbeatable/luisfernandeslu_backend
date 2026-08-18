import { Router } from 'express'
import deliveryController from '../controllers/delivery.controller.js'
import {
  deliveryIdParamSchema,
  listDeliveriesQuerySchema,
  updateDeliveryStatusBodySchema,
  verifyDeliveryOtpBodySchema,
} from '../validations/delivery.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class TransporterDeliveryRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('transporter'))

    this.router.get(
      '/',
      validate(listDeliveriesQuerySchema, 'query'),
      (req, res, next) => deliveryController.listForTransporter(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(deliveryIdParamSchema, 'params'),
      (req, res, next) => deliveryController.getForTransporter(req, res, next),
    )

    this.router.patch(
      '/:id/status',
      validate(deliveryIdParamSchema, 'params'),
      validate(updateDeliveryStatusBodySchema, 'body'),
      (req, res, next) => deliveryController.updateStatus(req, res, next),
    )

    this.router.post(
      '/:id/verify-otp',
      validate(deliveryIdParamSchema, 'params'),
      validate(verifyDeliveryOtpBodySchema, 'body'),
      (req, res, next) => deliveryController.verifyOtp(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new TransporterDeliveryRoutes().getRoutes()
