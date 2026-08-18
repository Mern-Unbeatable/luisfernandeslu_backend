import { Router } from 'express'
import quoteController from '../controllers/quote.controller.js'
import {
  productIdParamSchema,
  sendQuoteBodySchema,
} from '../validations/quote.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

/**
 * Company "Send Quote" from a marketplace product card.
 * Mounted at `/api/marketplace/products` so the public URL stays
 * `POST /api/marketplace/products/:id/quote`.
 */
class MarketplaceQuoteRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.post(
      '/:id/quote',
      requireAccessToken,
      requireRoles('company'),
      validate(productIdParamSchema, 'params'),
      validate(sendQuoteBodySchema, 'body'),
      (req, res, next) => quoteController.createForProduct(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new MarketplaceQuoteRoutes().getRoutes()
