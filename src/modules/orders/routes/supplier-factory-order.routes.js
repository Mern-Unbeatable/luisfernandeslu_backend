import { Router } from 'express'
import factoryOrderController from '../controllers/factory-order.controller.js'
import {
  factoryOrderIdParamSchema,
  listFactoryOrdersQuerySchema,
} from '../validations/factory-order.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

/** Mounted at `/api/supplier/factory-orders`. */
class SupplierFactoryOrderRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.get(
      '/factories',
      (req, res, next) => factoryOrderController.listFactories(req, res, next),
    )

    this.router.get(
      '/',
      validate(listFactoryOrdersQuerySchema, 'query'),
      (req, res, next) => factoryOrderController.listForSupplier(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(factoryOrderIdParamSchema, 'params'),
      (req, res, next) => factoryOrderController.getByIdForSupplier(req, res, next),
    )

    this.router.delete(
      '/:id',
      validate(factoryOrderIdParamSchema, 'params'),
      (req, res, next) => factoryOrderController.deleteForSupplier(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new SupplierFactoryOrderRoutes().getRoutes()
