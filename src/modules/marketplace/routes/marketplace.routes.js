import { Router } from 'express'
import marketplaceController from '../controllers/marketplace.controller.js'
import {
  marketplaceListQuerySchema,
  marketplaceProductSlugParamSchema,
  marketplaceSimpleListQuerySchema,
} from '../validations/marketplace.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import { optionalAccessToken } from '../../../middlewares/auth.middleware.js'

class MarketplaceRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    // Optional Bearer: guest/customer = retail, company = B2B fields
    this.router.use(optionalAccessToken)

    this.router.get(
      '/sponsored',
      validate(marketplaceSimpleListQuerySchema, 'query'),
      (req, res, next) => marketplaceController.listSponsored(req, res, next),
    )

    this.router.get(
      '/top-selling',
      validate(marketplaceSimpleListQuerySchema, 'query'),
      (req, res, next) => marketplaceController.listTopSelling(req, res, next),
    )

    this.router.get(
      '/',
      validate(marketplaceListQuerySchema, 'query'),
      (req, res, next) => marketplaceController.list(req, res, next),
    )

    this.router.get(
      '/:slug',
      validate(marketplaceProductSlugParamSchema, 'params'),
      (req, res, next) => marketplaceController.getBySlug(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new MarketplaceRoutes().getRoutes()
