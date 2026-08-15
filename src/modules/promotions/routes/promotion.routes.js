import { Router } from 'express'
import promotionController from '../controllers/promotion.controller.js'
import { requireAccessToken, requireRoles } from '../../../middlewares/auth.middleware.js'

class PromotionRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    // Public to supplier (and admin) — plans for Promote modal
    this.router.get(
      '/plans',
      requireAccessToken,
      requireRoles('supplier', 'admin'),
      (req, res, next) => promotionController.listPlans(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new PromotionRoutes().getRoutes()
