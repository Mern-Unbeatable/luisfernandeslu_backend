import { Router } from 'express'
import adminOrderController from '../controllers/order.controller.js'
import {
  adminOrderIdParamSchema,
  listAdminOrdersQuerySchema,
  updateAdminOrderStatusBodySchema,
} from '../validations/order.validation.js'
import { validate } from '../../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../../middlewares/auth.middleware.js'

/** Mounted at `/api/admin/orders`. */
class AdminOrderRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('admin'))

    this.router.get(
      '/',
      validate(listAdminOrdersQuerySchema, 'query'),
      (req, res, next) => adminOrderController.list(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(adminOrderIdParamSchema, 'params'),
      (req, res, next) => adminOrderController.getById(req, res, next),
    )

    this.router.patch(
      '/:id/status',
      validate(adminOrderIdParamSchema, 'params'),
      validate(updateAdminOrderStatusBodySchema, 'body'),
      (req, res, next) => adminOrderController.updateStatus(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AdminOrderRoutes().getRoutes()
