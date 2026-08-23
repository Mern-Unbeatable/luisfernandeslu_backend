import { Router } from 'express'
import supplierReturnsController from '../controllers/supplier-returns.controller.js'
import {
  supplierReturnIdParamSchema,
  updateSupplierReturnStatusBodySchema,
} from '../validations/supplier-returns.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class SupplierReturnsRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.get('/', (req, res, next) =>
      supplierReturnsController.list(req, res, next),
    )

    this.router.get(
      '/:returnId',
      validate(supplierReturnIdParamSchema, 'params'),
      (req, res, next) => supplierReturnsController.getById(req, res, next),
    )

    this.router.patch(
      '/:returnId/status',
      validate(supplierReturnIdParamSchema, 'params'),
      validate(updateSupplierReturnStatusBodySchema, 'body'),
      (req, res, next) =>
        supplierReturnsController.updateStatus(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new SupplierReturnsRoutes().getRoutes()
