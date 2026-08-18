import { Router } from 'express'
import documentController from '../controllers/document.controller.js'
import {
  documentIdParamSchema,
  downloadQuerySchema,
  eligibleOrdersQuerySchema,
  generateDocumentBodySchema,
  listDocumentsQuerySchema,
} from '../validations/document.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class SupplierDocumentRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.get('/stats', (req, res, next) =>
      documentController.stats(req, res, next),
    )

    this.router.get(
      '/eligible-orders',
      validate(eligibleOrdersQuerySchema, 'query'),
      (req, res, next) => documentController.eligibleOrders(req, res, next),
    )

    this.router.get(
      '/',
      validate(listDocumentsQuerySchema, 'query'),
      (req, res, next) => documentController.list(req, res, next),
    )

    this.router.post(
      '/',
      validate(generateDocumentBodySchema, 'body'),
      (req, res, next) => documentController.generate(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(documentIdParamSchema, 'params'),
      (req, res, next) => documentController.getById(req, res, next),
    )

    this.router.get(
      '/:id/pdf',
      validate(documentIdParamSchema, 'params'),
      validate(downloadQuerySchema, 'query'),
      (req, res, next) => documentController.download(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new SupplierDocumentRoutes().getRoutes()
