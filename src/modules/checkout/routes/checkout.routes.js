import { Router } from 'express'
import checkoutController from '../controllers/checkout.controller.js'
import {
  placeCheckoutBodySchema,
  checkoutIdParamSchema,
  shippingQuoteBodySchema,
  directBuyQuoteBodySchema,
} from '../validations/checkout.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class CheckoutRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.post('/webhook/eupago', (req, res, next) =>
      checkoutController.eupagoWebhook(req, res, next),
    )

    this.router.use(requireAccessToken)

    this.router.get(
      '/suggest-locations',
      (req, res, next) => checkoutController.suggestLocations(req, res, next),
    )

    this.router.use(requireRoles('customer', 'company', 'supplier'))

    this.router.post(
      '/direct-buy/quote',
      validate(directBuyQuoteBodySchema, 'body'),
      (req, res, next) => checkoutController.quoteDirectBuy(req, res, next),
    )

    this.router.post(
      '/shipping-quote',
      validate(shippingQuoteBodySchema, 'body'),
      (req, res, next) => checkoutController.quoteShipping(req, res, next),
    )

    this.router.post(
      '/',
      validate(placeCheckoutBodySchema, 'body'),
      (req, res, next) => checkoutController.place(req, res, next),
    )

    this.router.post(
      '/:id/pay',
      validate(checkoutIdParamSchema, 'params'),
      (req, res, next) => checkoutController.confirmPay(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(checkoutIdParamSchema, 'params'),
      (req, res, next) => checkoutController.getById(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new CheckoutRoutes().getRoutes()
