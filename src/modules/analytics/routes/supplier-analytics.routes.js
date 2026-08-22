import { Router } from 'express'
import supplierAnalyticsController from '../controllers/supplier-analytics.controller.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class SupplierAnalyticsRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.get('/', (req, res, next) =>
      supplierAnalyticsController.dashboard(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new SupplierAnalyticsRoutes().getRoutes()
