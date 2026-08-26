import { Router } from 'express'
import buyerOrderController from '../controllers/buyer-order.controller.js'
import {
  buyerOrderIdParamSchema,
  listBuyerOrdersQuerySchema,
  cancelBuyerOrderBodySchema,
} from '../validations/buyer-order.validation.js'
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
      validate(listBuyerOrdersQuerySchema, 'query'),
      (req, res, next) => buyerOrderController.list(req, res, next),
    )

    this.router.get(
      '/:orderId/track',
      validate(buyerOrderIdParamSchema, 'params'),
      (req, res, next) => buyerOrderController.track(req, res, next),
    )

    this.router.get(
      '/:orderId/invoice',
      validate(buyerOrderIdParamSchema, 'params'),
      (req, res, next) => buyerOrderController.getInvoice(req, res, next),
    )

    this.router.get(
      '/:orderId/invoice/download',
      validate(buyerOrderIdParamSchema, 'params'),
      (req, res, next) => buyerOrderController.downloadInvoice(req, res, next),
    )

    this.router.post(
      '/:orderId/cancel',
      validate(buyerOrderIdParamSchema, 'params'),
      validate(cancelBuyerOrderBodySchema, 'body'),
      (req, res, next) => buyerOrderController.cancel(req, res, next),
    )

    this.router.get(
      '/:orderId',
      validate(buyerOrderIdParamSchema, 'params'),
      (req, res, next) => buyerOrderController.getById(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new BuyerOrderRoutes().getRoutes()
