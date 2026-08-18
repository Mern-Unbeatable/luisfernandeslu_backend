import { Router } from 'express'
import factoryOrderController from '../controllers/factory-order.controller.js'
import {
  factoryOrderIdParamSchema,
  listFactoryOrdersQuerySchema,
  updateFactoryOrderStatusBodySchema,
} from '../validations/factory-order.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

/** Mounted at `/api/factory/orders`. */
class FactoryOrderRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('factory'))

    this.router.get(
      '/companies',
      (req, res, next) => factoryOrderController.listCompanies(req, res, next),
    )

    this.router.get(
      '/',
      validate(listFactoryOrdersQuerySchema, 'query'),
      (req, res, next) => factoryOrderController.listForFactory(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(factoryOrderIdParamSchema, 'params'),
      (req, res, next) => factoryOrderController.getByIdForFactory(req, res, next),
    )

    this.router.patch(
      '/:id/status',
      validate(factoryOrderIdParamSchema, 'params'),
      validate(updateFactoryOrderStatusBodySchema, 'body'),
      (req, res, next) =>
        factoryOrderController.updateStatusForFactory(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new FactoryOrderRoutes().getRoutes()
