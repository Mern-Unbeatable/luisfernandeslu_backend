import { Router } from 'express'
import supplierOverviewController from '../controllers/supplier-overview.controller.js'
import { supplierOverviewQuerySchema } from '../validations/supplier-overview.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class SupplierOverviewRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.get(
      '/',
      validate(supplierOverviewQuerySchema, 'query'),
      (req, res, next) => supplierOverviewController.get(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new SupplierOverviewRoutes().getRoutes()
