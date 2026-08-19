import { Router } from 'express'
import auctionController from '../controllers/auction.controller.js'
import {
  auctionIdParamSchema,
  auctionOrderIdParamSchema,
  createAuctionBodySchema,
  listAuctionsQuerySchema,
} from '../validations/auction.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class FactoryAuctionRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('factory'))

    this.router.get(
      '/order/:orderId',
      validate(auctionOrderIdParamSchema, 'params'),
      (req, res, next) => auctionController.getFactoryCreateInfo(req, res, next),
    )

    this.router.post('/', validate(createAuctionBodySchema, 'body'), (req, res, next) =>
      auctionController.createFactoryAuction(req, res, next),
    )

    this.router.get(
      '/active',
      validate(listAuctionsQuerySchema, 'query'),
      (req, res, next) => auctionController.listActiveForFactory(req, res, next),
    )

    this.router.get(
      '/assigned',
      validate(listAuctionsQuerySchema, 'query'),
      (req, res, next) => auctionController.listAssignedForFactory(req, res, next),
    )

    this.router.get(
      '/active/:id',
      validate(auctionIdParamSchema, 'params'),
      (req, res, next) => auctionController.getActiveForFactory(req, res, next),
    )

    this.router.get(
      '/assigned/:id',
      validate(auctionIdParamSchema, 'params'),
      (req, res, next) => auctionController.getAssignedForFactory(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new FactoryAuctionRoutes().getRoutes()
