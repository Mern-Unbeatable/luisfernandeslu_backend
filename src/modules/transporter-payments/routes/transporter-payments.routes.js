import { Router } from 'express'
import transporterPaymentsController from '../controllers/transporter-payments.controller.js'
import {
  listTransporterPaymentsQuerySchema,
  withdrawTransporterFundsBodySchema,
} from '../validations/transporter-payments.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class TransporterPaymentsRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('transporter'))

    this.router.get(
      '/',
      validate(listTransporterPaymentsQuerySchema, 'query'),
      (req, res, next) => transporterPaymentsController.get(req, res, next),
    )

    this.router.post(
      '/withdrawals',
      validate(withdrawTransporterFundsBodySchema, 'body'),
      (req, res, next) =>
        transporterPaymentsController.withdraw(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new TransporterPaymentsRoutes().getRoutes()
