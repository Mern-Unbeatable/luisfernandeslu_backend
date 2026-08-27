import { Router } from 'express'
import transporterOverviewController from '../controllers/transporter-overview.controller.js'
import { transporterDashboardQuerySchema } from '../validations/transporter-overview.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

/** Mounted at `/api/transporter/dashboard`. */
class TransporterOverviewRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('transporter'))

    this.router.get(
      '/',
      validate(transporterDashboardQuerySchema, 'query'),
      (req, res, next) => transporterOverviewController.get(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new TransporterOverviewRoutes().getRoutes()
