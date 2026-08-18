import { Router } from 'express'
import factoryOfferController from '../controllers/factory-offer.controller.js'
import {
  createFactoryOfferBodySchema,
  offerIdParamSchema,
  threadIdParamSchema,
  listMessagesQuerySchema,
} from '../validations/factory-offer.validation.js'
import { listFactoryOrdersQuerySchema } from '../../orders/validations/factory-order.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class FactoryOfferRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('factory', 'supplier'))

    this.router.get(
      '/orders',
      validate(listFactoryOrdersQuerySchema, 'query'),
      (req, res, next) => factoryOfferController.listOrders(req, res, next),
    )

    this.router.get(
      '/threads/:threadId/messages',
      validate(threadIdParamSchema, 'params'),
      validate(listMessagesQuerySchema, 'query'),
      (req, res, next) => factoryOfferController.listMessages(req, res, next),
    )

    this.router.post(
      '/',
      requireRoles('factory'),
      validate(createFactoryOfferBodySchema, 'body'),
      (req, res, next) => factoryOfferController.create(req, res, next),
    )

    this.router.post(
      '/:offerId/pay',
      requireRoles('supplier'),
      validate(offerIdParamSchema, 'params'),
      (req, res, next) => factoryOfferController.pay(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new FactoryOfferRoutes().getRoutes()
