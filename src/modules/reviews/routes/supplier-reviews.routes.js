import { Router } from 'express'
import supplierReviewsController from '../controllers/supplier-reviews.controller.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class SupplierReviewsRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.get('/', (req, res, next) =>
      supplierReviewsController.list(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new SupplierReviewsRoutes().getRoutes()
