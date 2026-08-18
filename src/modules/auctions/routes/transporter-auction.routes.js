import { Router } from 'express'
import auctionController from '../controllers/auction.controller.js'
import {
  auctionIdParamSchema,
  createBidBodySchema,
  listAuctionsQuerySchema,
} from '../validations/auction.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class TransporterAuctionRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('transporter'))

    this.router.get(
      '/',
      validate(listAuctionsQuerySchema, 'query'),
      (req, res, next) => auctionController.listForTransporter(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(auctionIdParamSchema, 'params'),
      (req, res, next) => auctionController.getForTransporter(req, res, next),
    )

    this.router.post(
      '/:id/bids',
      validate(auctionIdParamSchema, 'params'),
      validate(createBidBodySchema, 'body'),
      (req, res, next) => auctionController.bidForTransporter(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new TransporterAuctionRoutes().getRoutes()
