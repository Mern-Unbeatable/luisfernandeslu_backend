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

class SupplierAuctionRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.get(
      '/order/:orderId',
      validate(auctionOrderIdParamSchema, 'params'),
      (req, res, next) => auctionController.getCreateInfoForSupplier(req, res, next),
    )

    this.router.post('/', validate(createAuctionBodySchema, 'body'), (req, res, next) =>
      auctionController.createForSupplier(req, res, next),
    )

    this.router.get(
      '/active',
      validate(listAuctionsQuerySchema, 'query'),
      (req, res, next) => auctionController.listActiveForSupplier(req, res, next),
    )

    this.router.get(
      '/assigned',
      validate(listAuctionsQuerySchema, 'query'),
      (req, res, next) => auctionController.listAssignedForSupplier(req, res, next),
    )

    this.router.get(
      '/active/:id',
      validate(auctionIdParamSchema, 'params'),
      (req, res, next) => auctionController.getActiveForSupplier(req, res, next),
    )

    this.router.get(
      '/assigned/:id',
      validate(auctionIdParamSchema, 'params'),
      (req, res, next) => auctionController.getAssignedForSupplier(req, res, next),
    )

    this.router.post(
      '/factory/:id/pay',
      validate(auctionIdParamSchema, 'params'),
      (req, res, next) => auctionController.confirmFactoryAuctionPayment(req, res, next),
    )

    this.router.post(
      '/factory/:id/decline',
      validate(auctionIdParamSchema, 'params'),
      (req, res, next) => auctionController.declineFactoryAuctionPayment(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new SupplierAuctionRoutes().getRoutes()
