import { Router } from 'express'
import buyerReviewsController from '../controllers/buyer-reviews.controller.js'
import {
  pendingReviewIdParamSchema,
  listPendingReviewsQuerySchema,
  createBuyerReviewBodySchema,
} from '../validations/buyer-reviews.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class BuyerReviewsRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('customer', 'company'))

    this.router.get(
      '/pending',
      validate(listPendingReviewsQuerySchema, 'query'),
      (req, res, next) => buyerReviewsController.listPending(req, res, next),
    )

    this.router.get(
      '/pending/:id',
      validate(pendingReviewIdParamSchema, 'params'),
      (req, res, next) => buyerReviewsController.getPending(req, res, next),
    )

    this.router.post(
      '/',
      validate(createBuyerReviewBodySchema, 'body'),
      (req, res, next) => buyerReviewsController.create(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new BuyerReviewsRoutes().getRoutes()
