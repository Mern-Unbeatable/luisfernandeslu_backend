import { Router } from 'express'
import promotionController from '../controllers/promotion.controller.js'
import {
  payPromotionBodySchema,
  productIdParamSchema,
  productPromotionParamsSchema,
  promoteBodySchema,
} from '../validations/promotion.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

/**
 * Supplier promote/pay actions on a product.
 * Mounted at `/api/products` so URLs stay
 * `POST /api/products/:id/promote` and
 * `POST /api/products/:id/promotions/:promotionId/pay`.
 */
class SupplierProductPromotionRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.post(
      '/:id/promote',
      validate(productIdParamSchema, 'params'),
      validate(promoteBodySchema, 'body'),
      (req, res, next) => promotionController.requestPromotion(req, res, next),
    )

    this.router.post(
      '/:id/promotions/:promotionId/pay',
      validate(productPromotionParamsSchema, 'params'),
      validate(payPromotionBodySchema, 'body'),
      (req, res, next) => promotionController.confirmPayment(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new SupplierProductPromotionRoutes().getRoutes()
