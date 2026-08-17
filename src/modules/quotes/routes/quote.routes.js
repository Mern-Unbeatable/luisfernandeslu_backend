import { Router } from 'express'
import quoteController from '../controllers/quote.controller.js'
import {
  quoteIdParamSchema,
  offerIdParamSchema,
  listQuotesQuerySchema,
  listMessagesQuerySchema,
  sendMessageBodySchema,
  createOfferBodySchema,
} from '../validations/quote.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class QuoteRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    // Company + supplier participate in quote chat
    this.router.use(requireAccessToken, requireRoles('company', 'supplier'))

    this.router.get(
      '/',
      validate(listQuotesQuerySchema, 'query'),
      (req, res, next) => quoteController.list(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(quoteIdParamSchema, 'params'),
      (req, res, next) => quoteController.getById(req, res, next),
    )

    this.router.get(
      '/:id/messages',
      validate(quoteIdParamSchema, 'params'),
      validate(listMessagesQuerySchema, 'query'),
      (req, res, next) => quoteController.listMessages(req, res, next),
    )

    this.router.post(
      '/:id/messages',
      validate(quoteIdParamSchema, 'params'),
      validate(sendMessageBodySchema, 'body'),
      (req, res, next) => quoteController.sendMessage(req, res, next),
    )

    // Supplier Create Offer Card
    this.router.post(
      '/:id/offers',
      requireRoles('supplier'),
      validate(quoteIdParamSchema, 'params'),
      validate(createOfferBodySchema, 'body'),
      (req, res, next) => quoteController.createOffer(req, res, next),
    )

    // Company respond to offer
    this.router.post(
      '/:id/offers/:offerId/negotiate',
      requireRoles('company'),
      validate(offerIdParamSchema, 'params'),
      (req, res, next) => quoteController.negotiateOffer(req, res, next),
    )

    this.router.post(
      '/:id/offers/:offerId/accept',
      requireRoles('company'),
      validate(offerIdParamSchema, 'params'),
      (req, res, next) => quoteController.acceptOffer(req, res, next),
    )

    this.router.post(
      '/:id/offers/:offerId/pay',
      requireRoles('company'),
      validate(offerIdParamSchema, 'params'),
      (req, res, next) => quoteController.payOffer(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new QuoteRoutes().getRoutes()
