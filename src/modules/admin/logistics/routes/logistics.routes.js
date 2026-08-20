import { Router } from 'express'
import adminLogisticsController from '../controllers/logistics.controller.js'
import {
  adminLogisticsIdParamSchema,
  listAdminLogisticsQuerySchema,
} from '../validations/logistics.validation.js'
import { validate } from '../../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../../middlewares/auth.middleware.js'

/** Mounted at `/api/admin/logistics`. */
class AdminLogisticsRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('admin'))

    this.router.get(
      '/',
      validate(listAdminLogisticsQuerySchema, 'query'),
      (req, res, next) => adminLogisticsController.list(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(adminLogisticsIdParamSchema, 'params'),
      (req, res, next) => adminLogisticsController.getById(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AdminLogisticsRoutes().getRoutes()
