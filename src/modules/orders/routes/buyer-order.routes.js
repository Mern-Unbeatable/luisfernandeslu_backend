import { Router } from 'express'
import deliveryController from '../../auctions/controllers/delivery.controller.js'
import {
  buyerOrderIdParamSchema,
  listDeliveriesQuerySchema,
} from '../../auctions/validations/delivery.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class BuyerOrderRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('customer', 'company'))

    this.router.get(
      '/',
      validate(listDeliveriesQuerySchema, 'query'),
      (req, res, next) => deliveryController.listForBuyer(req, res, next),
    )

    this.router.get(
      '/:orderId',
      validate(buyerOrderIdParamSchema, 'params'),
      (req, res, next) => deliveryController.getForBuyer(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new BuyerOrderRoutes().getRoutes()
