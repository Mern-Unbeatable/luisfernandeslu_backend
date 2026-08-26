import { Router } from 'express'
import rolesPermissionsController from '../controllers/roles-permissions.controller.js'
import {
  inviteStaffBodySchema,
  saveModeratorPermissionsBodySchema,
} from '../validations/roles-permissions.validation.js'
import { validate } from '../../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../../middlewares/auth.middleware.js'

/** Mounted at `/api/admin/roles-permissions`. */
class AdminRolesPermissionsRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('admin'))

    this.router.get('/', (req, res, next) =>
      rolesPermissionsController.get(req, res, next),
    )

    this.router.put(
      '/moderator',
      validate(saveModeratorPermissionsBodySchema, 'body'),
      (req, res, next) =>
        rolesPermissionsController.saveModeratorPermissions(req, res, next),
    )

    this.router.post(
      '/invite',
      validate(inviteStaffBodySchema, 'body'),
      (req, res, next) => rolesPermissionsController.invite(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AdminRolesPermissionsRoutes().getRoutes()
