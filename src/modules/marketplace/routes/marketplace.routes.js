import { Router } from 'express'
import marketplaceController from '../controllers/marketplace.controller.js'
import {
  marketplaceListQuerySchema,
  marketplaceProductIdParamSchema,
} from '../validations/marketplace.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import { optionalAccessToken } from '../../../middlewares/auth.middleware.js'

class MarketplaceRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    // Public — optional Bearer token (company sees B2B prices)
    this.router.use(optionalAccessToken)

    this.router.get(
      '/',
      validate(marketplaceListQuerySchema, 'query'),
      (req, res, next) => marketplaceController.list(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(marketplaceProductIdParamSchema, 'params'),
      (req, res, next) => marketplaceController.getById(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new MarketplaceRoutes().getRoutes()
