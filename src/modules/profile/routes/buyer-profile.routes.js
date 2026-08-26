import { Router } from 'express'
import buyerProfileController from '../controllers/buyer-profile.controller.js'
import {
  changeBuyerPasswordBodySchema,
  saveBuyerAddressBodySchema,
  saveBuyerIbanBodySchema,
  updateBuyerAccountBodySchema,
} from '../validations/buyer-profile.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'
import {
  avatarUpload,
  AVATAR_FILE_FIELDS,
} from '../../../shared/upload/evidence-upload.js'

/** Multer only when multipart — JSON PATCH still works. */
function optionalAvatarUpload(req, res, next) {
  const ct = String(req.headers['content-type'] || '')
  if (ct.includes('multipart/form-data')) {
    return avatarUpload.fields(AVATAR_FILE_FIELDS)(req, res, next)
  }
  return next()
}

class BuyerProfileRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('customer', 'company'))

    this.router.get('/', (req, res, next) =>
      buyerProfileController.get(req, res, next),
    )

    this.router.patch(
      '/',
      optionalAvatarUpload,
      validate(updateBuyerAccountBodySchema, 'body'),
      (req, res, next) => buyerProfileController.updateAccount(req, res, next),
    )

    this.router.post(
      '/password',
      validate(changeBuyerPasswordBodySchema, 'body'),
      (req, res, next) => buyerProfileController.changePassword(req, res, next),
    )

    this.router.put(
      '/iban',
      validate(saveBuyerIbanBodySchema, 'body'),
      (req, res, next) => buyerProfileController.saveIban(req, res, next),
    )

    this.router.put(
      '/billing-address',
      validate(saveBuyerAddressBodySchema, 'body'),
      (req, res, next) =>
        buyerProfileController.saveBillingAddress(req, res, next),
    )

    this.router.put(
      '/shipping-address',
      validate(saveBuyerAddressBodySchema, 'body'),
      (req, res, next) =>
        buyerProfileController.saveShippingAddress(req, res, next),
    )

    this.router.post(
      '/avatar',
      avatarUpload.fields(AVATAR_FILE_FIELDS),
      (req, res, next) => buyerProfileController.uploadAvatar(req, res, next),
    )

    this.router.delete('/avatar', (req, res, next) =>
      buyerProfileController.removeAvatar(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new BuyerProfileRoutes().getRoutes()
