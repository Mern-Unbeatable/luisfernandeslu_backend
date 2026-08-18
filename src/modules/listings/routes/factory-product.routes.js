import { Router } from 'express'
import factoryProductController from '../controllers/factory-product.controller.js'
import {
  factoryAiBodySchema,
  factoryCreateBodySchema,
  factoryEditBodySchema,
  factoryListQuerySchema,
  factoryProductIdParamSchema,
} from '../validations/factory-product.validation.js'
import {
  PRODUCT_FILE_FIELDS,
  productUpload,
  productCsvUpload,
} from '../../../shared/upload/product-upload.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class FactoryProductRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('factory'))

    this.router.get(
      '/',
      validate(factoryListQuerySchema, 'query'),
      (req, res, next) => factoryProductController.list(req, res, next),
    )

    this.router.post(
      '/ai-generate',
      validate(factoryAiBodySchema, 'body'),
      (req, res, next) => factoryProductController.generateAi(req, res, next),
    )

    this.router.post(
      '/',
      productUpload.fields(PRODUCT_FILE_FIELDS),
      validate(factoryCreateBodySchema, 'body'),
      (req, res, next) => factoryProductController.create(req, res, next),
    )

    this.router.get('/csv-template', (req, res, next) =>
      factoryProductController.downloadCsvTemplate(req, res, next),
    )

    this.router.get('/csv-category-guide', (req, res, next) =>
      factoryProductController.downloadCategoryGuidePdf(req, res, next),
    )

    this.router.post(
      '/csv-upload',
      productCsvUpload.single('file'),
      (req, res, next) => factoryProductController.importCsv(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(factoryProductIdParamSchema, 'params'),
      (req, res, next) => factoryProductController.getById(req, res, next),
    )

    this.router.patch(
      '/:id',
      productUpload.fields(PRODUCT_FILE_FIELDS),
      validate(factoryProductIdParamSchema, 'params'),
      validate(factoryEditBodySchema, 'body'),
      (req, res, next) => factoryProductController.update(req, res, next),
    )

    this.router.post(
      '/:id/resubmit',
      productUpload.fields(PRODUCT_FILE_FIELDS),
      validate(factoryProductIdParamSchema, 'params'),
      validate(factoryEditBodySchema, 'body'),
      (req, res, next) => factoryProductController.resubmit(req, res, next),
    )

    this.router.post(
      '/:id/cancel',
      validate(factoryProductIdParamSchema, 'params'),
      (req, res, next) => factoryProductController.cancel(req, res, next),
    )

    this.router.delete(
      '/:id',
      validate(factoryProductIdParamSchema, 'params'),
      (req, res, next) => factoryProductController.remove(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new FactoryProductRoutes().getRoutes()
