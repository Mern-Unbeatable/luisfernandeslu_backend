import { Router } from 'express'
import promoCodeController from '../controllers/promo-code.controller.js'
import {
  createPromoCodeBodySchema,
  listPromoCodesQuerySchema,
  promoCodeIdParamSchema,
  promoCodeStatusBodySchema,
  updatePromoCodeBodySchema,
} from '../validations/promo-code.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class PromoCodeRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.get(
      '/',
      validate(listPromoCodesQuerySchema, 'query'),
      (req, res, next) => promoCodeController.list(req, res, next),
    )

    this.router.post(
      '/',
      validate(createPromoCodeBodySchema, 'body'),
      (req, res, next) => promoCodeController.create(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(promoCodeIdParamSchema, 'params'),
      (req, res, next) => promoCodeController.getById(req, res, next),
    )

    this.router.patch(
      '/:id',
      validate(promoCodeIdParamSchema, 'params'),
      validate(updatePromoCodeBodySchema, 'body'),
      (req, res, next) => promoCodeController.update(req, res, next),
    )

    this.router.patch(
      '/:id/status',
      validate(promoCodeIdParamSchema, 'params'),
      validate(promoCodeStatusBodySchema, 'body'),
      (req, res, next) => promoCodeController.setStatus(req, res, next),
    )

    this.router.delete(
      '/:id',
      validate(promoCodeIdParamSchema, 'params'),
      (req, res, next) => promoCodeController.remove(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new PromoCodeRoutes().getRoutes()
