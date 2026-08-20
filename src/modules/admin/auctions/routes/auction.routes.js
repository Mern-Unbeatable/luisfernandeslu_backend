import { Router } from 'express'
import auctionController from '../../../auctions/controllers/auction.controller.js'
import { listAuctionsQuerySchema } from '../../../auctions/validations/auction.validation.js'
import { validate } from '../../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../../middlewares/auth.middleware.js'

/** Mounted at `/api/admin/auctions`. */
class AdminAuctionRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('admin'))

    this.router.get(
      '/',
      validate(listAuctionsQuerySchema, 'query'),
      (req, res, next) => auctionController.listForAdmin(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AdminAuctionRoutes().getRoutes()
