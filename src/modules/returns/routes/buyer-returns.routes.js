import { Router } from 'express'
import buyerReturnsController from '../controllers/buyer-returns.controller.js'
import {
  buyerOrderIdParamSchema,
  buyerReturnIdParamSchema,
  createBuyerReturnBodySchema,
} from '../validations/buyer-returns.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class BuyerReturnsRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('customer', 'company'))

    this.router.get('/orders', (req, res, next) =>
      buyerReturnsController.listOrders(req, res, next),
    )

    this.router.get(
      '/orders/:orderId',
      validate(buyerOrderIdParamSchema, 'params'),
      (req, res, next) => buyerReturnsController.getOrder(req, res, next),
    )

    this.router.get('/requests', (req, res, next) =>
      buyerReturnsController.listRequests(req, res, next),
    )

    this.router.post(
      '/requests',
      validate(createBuyerReturnBodySchema, 'body'),
      (req, res, next) => buyerReturnsController.createRequest(req, res, next),
    )

    this.router.get(
      '/requests/:returnId',
      validate(buyerReturnIdParamSchema, 'params'),
      (req, res, next) => buyerReturnsController.getRequest(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new BuyerReturnsRoutes().getRoutes()
