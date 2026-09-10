import { Router } from 'express'
import adminProfileController from '../controllers/admin-profile.controller.js'
import {
  changeAdminPasswordBodySchema,
  saveAdminIbanBodySchema,
  updateAdminProfileBodySchema,
} from '../validations/admin-profile.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'
import {
  avatarUpload,
  AVATAR_FILE_FIELDS,
} from '../../../shared/upload/evidence-upload.js'

/** Mounted at `/api/admin/profile`. */
class AdminProfileRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('admin'))

    this.router.get('/', (req, res, next) =>
      adminProfileController.get(req, res, next),
    )

    this.router.patch(
      '/',
      validate(updateAdminProfileBodySchema, 'body'),
      (req, res, next) => adminProfileController.update(req, res, next),
    )

    this.router.post(
      '/password',
      validate(changeAdminPasswordBodySchema, 'body'),
      (req, res, next) => adminProfileController.changePassword(req, res, next),
    )

    this.router.put(
      '/iban',
      validate(saveAdminIbanBodySchema, 'body'),
      (req, res, next) => adminProfileController.saveIban(req, res, next),
    )

    this.router.post(
      '/avatar',
      avatarUpload.fields(AVATAR_FILE_FIELDS),
      (req, res, next) => adminProfileController.uploadAvatar(req, res, next),
    )

    this.router.delete('/avatar', (req, res, next) =>
      adminProfileController.removeAvatar(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AdminProfileRoutes().getRoutes()
