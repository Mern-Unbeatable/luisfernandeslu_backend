import { Router } from 'express'
import adminUserController from '../controllers/user.controller.js'
import {
  adminUserIdParamSchema,
  listAdminUsersQuerySchema,
  updateAdminUserStatusBodySchema,
} from '../validations/user.validation.js'
import { validate } from '../../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../../middlewares/auth.middleware.js'

/** Mounted at `/api/admin/users`. */
class AdminUserRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('admin'))

    this.router.get('/stats', (req, res, next) =>
      adminUserController.stats(req, res, next),
    )

    this.router.get(
      '/',
      validate(listAdminUsersQuerySchema, 'query'),
      (req, res, next) => adminUserController.list(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(adminUserIdParamSchema, 'params'),
      (req, res, next) => adminUserController.getById(req, res, next),
    )

    this.router.patch(
      '/:id/status',
      validate(adminUserIdParamSchema, 'params'),
      validate(updateAdminUserStatusBodySchema, 'body'),
      (req, res, next) => adminUserController.updateStatus(req, res, next),
    )

    this.router.delete(
      '/:id',
      validate(adminUserIdParamSchema, 'params'),
      (req, res, next) => adminUserController.remove(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AdminUserRoutes().getRoutes()
