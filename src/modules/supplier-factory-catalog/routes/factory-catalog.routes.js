import { Router } from 'express'
import catalogController from '../controllers/factory-catalog.controller.js'
import {
  listFactoryCatalogQuerySchema,
  productIdParamSchema,
} from '../validations/factory-catalog.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class FactoryCatalogRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.get(
      '/',
      validate(listFactoryCatalogQuerySchema, 'query'),
      (req, res, next) => catalogController.list(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(productIdParamSchema, 'params'),
      (req, res, next) => catalogController.getById(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new FactoryCatalogRoutes().getRoutes()
