import { Router } from 'express'
import transporterProfileController from '../controllers/transporter-profile.controller.js'
import {
  changeTransporterPasswordBodySchema,
  saveTransporterIbanBodySchema,
  updateTransporterProfileBodySchema,
} from '../validations/transporter-profile.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'
import {
  avatarUpload,
  AVATAR_FILE_FIELDS,
} from '../../../shared/upload/evidence-upload.js'
import { resubmitUpload } from '../upload.js'

class TransporterProfileRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('transporter'))

    this.router.get('/', (req, res, next) =>
      transporterProfileController.get(req, res, next),
    )

    this.router.patch(
      '/',
      validate(updateTransporterProfileBodySchema, 'body'),
      (req, res, next) => transporterProfileController.update(req, res, next),
    )

    this.router.post(
      '/password',
      validate(changeTransporterPasswordBodySchema, 'body'),
      (req, res, next) =>
        transporterProfileController.changePassword(req, res, next),
    )

    this.router.put(
      '/iban',
      validate(saveTransporterIbanBodySchema, 'body'),
      (req, res, next) =>
        transporterProfileController.saveIban(req, res, next),
    )

    this.router.post(
      '/avatar',
      avatarUpload.fields(AVATAR_FILE_FIELDS),
      (req, res, next) =>
        transporterProfileController.uploadAvatar(req, res, next),
    )

    this.router.delete('/avatar', (req, res, next) =>
      transporterProfileController.removeAvatar(req, res, next),
    )

    this.router.post(
      '/resubmit-documents',
      resubmitUpload.any(),
      (req, res, next) => transporterProfileController.resubmitDocuments(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new TransporterProfileRoutes().getRoutes()
