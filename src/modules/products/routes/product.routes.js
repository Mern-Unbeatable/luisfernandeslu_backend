import { Router } from 'express'
import productController from '../controllers/product.controller.js'
import promotionController from '../../promotions/controllers/promotion.controller.js'
import {
  aiGenerateBodySchema,
  createProductBodySchema,
  editProductBodySchema,
  productIdParamSchema,
  skuLookupQuerySchema,
} from '../validations/product.validation.js'
import {
  listProductsQuerySchema,
} from '../validations/product-list.validation.js'
import {
  payPromotionBodySchema,
  promoteBodySchema,
  productPromotionParamsSchema,
} from '../../promotions/validations/promotion.validation.js'
import { PRODUCT_FILE_FIELDS, productUpload } from '../upload.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class ProductRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.get(
      '/',
      validate(listProductsQuerySchema, 'query'),
      (req, res, next) => productController.list(req, res, next),
    )

    this.router.get(
      '/lookup',
      validate(skuLookupQuerySchema, 'query'),
      (req, res, next) => productController.lookupBySku(req, res, next),
    )

    this.router.post(
      '/ai-generate',
      validate(aiGenerateBodySchema, 'body'),
      (req, res, next) => productController.generateAi(req, res, next),
    )

    this.router.post(
      '/',
      productUpload.fields(PRODUCT_FILE_FIELDS),
      validate(createProductBodySchema, 'body'),
      (req, res, next) => productController.create(req, res, next),
    )

    this.router.patch(
      '/:id',
      productUpload.fields(PRODUCT_FILE_FIELDS),
      validate(productIdParamSchema, 'params'),
      validate(editProductBodySchema, 'body'),
      (req, res, next) => productController.update(req, res, next),
    )

    this.router.post(
      '/:id/resubmit',
      productUpload.fields(PRODUCT_FILE_FIELDS),
      validate(productIdParamSchema, 'params'),
      validate(editProductBodySchema, 'body'),
      (req, res, next) => productController.resubmit(req, res, next),
    )

    this.router.post(
      '/:id/cancel-listing',
      validate(productIdParamSchema, 'params'),
      (req, res, next) => productController.cancelListing(req, res, next),
    )

    // Promote → pay (admin-defined plans)
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

export default new ProductRoutes().getRoutes()
