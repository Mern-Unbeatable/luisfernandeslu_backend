import { Router } from 'express'
import adminDashboardController from '../controllers/dashboard.controller.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../../middlewares/auth.middleware.js'

/** Mounted at `/api/admin/dashboard`. */
class AdminDashboardRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('admin'))

    this.router.get('/', (req, res, next) =>
      adminDashboardController.getOverview(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AdminDashboardRoutes().getRoutes()
