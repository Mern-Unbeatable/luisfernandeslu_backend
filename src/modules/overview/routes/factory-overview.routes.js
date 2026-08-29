import { Router } from 'express'
import factoryOverviewController from '../controllers/factory-overview.controller.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

/** Mounted at `/api/factory/dashboard`. */
class FactoryOverviewRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('factory'))

    this.router.get('/', (req, res, next) =>
      factoryOverviewController.get(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new FactoryOverviewRoutes().getRoutes()
