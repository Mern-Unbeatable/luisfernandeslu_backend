import { Router } from 'express'
import affiliateController from '../controllers/affiliate.controller.js'
import {
  changePasswordBodySchema,
  listClientsQuerySchema,
  listEarningsQuerySchema,
  overviewQuerySchema,
  saveIbanBodySchema,
  updateProfileBodySchema,
  withdrawBodySchema,
} from '../validations/affiliate.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'
import {
  avatarUpload,
  AVATAR_FILE_FIELDS,
} from '../../../shared/upload/evidence-upload.js'

/** Mounted at `/api/affiliate`. */
class AffiliateRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('affiliate'))

    this.router.get(
      '/overview',
      validate(overviewQuerySchema, 'query'),
      (req, res, next) => affiliateController.overview(req, res, next),
    )

    this.router.get('/referral', (req, res, next) =>
      affiliateController.referral(req, res, next),
    )

    this.router.get(
      '/clients',
      validate(listClientsQuerySchema, 'query'),
      (req, res, next) => affiliateController.clients(req, res, next),
    )

    this.router.get('/levels', (req, res, next) =>
      affiliateController.levels(req, res, next),
    )

    this.router.get(
      '/earnings',
      validate(listEarningsQuerySchema, 'query'),
      (req, res, next) => affiliateController.earnings(req, res, next),
    )

    this.router.post(
      '/withdrawals',
      validate(withdrawBodySchema, 'body'),
      (req, res, next) => affiliateController.withdraw(req, res, next),
    )

    this.router.get('/profile', (req, res, next) =>
      affiliateController.getProfile(req, res, next),
    )
    this.router.patch(
      '/profile',
      validate(updateProfileBodySchema, 'body'),
      (req, res, next) => affiliateController.updateProfile(req, res, next),
    )

    this.router.post(
      '/password',
      validate(changePasswordBodySchema, 'body'),
      (req, res, next) => affiliateController.changePassword(req, res, next),
    )

    this.router.get('/iban', (req, res, next) =>
      affiliateController.getIban(req, res, next),
    )
    this.router.put(
      '/iban',
      validate(saveIbanBodySchema, 'body'),
      (req, res, next) => affiliateController.saveIban(req, res, next),
    )

    this.router.post(
      '/profile/avatar',
      avatarUpload.fields(AVATAR_FILE_FIELDS),
      (req, res, next) => affiliateController.uploadAvatar(req, res, next),
    )
    this.router.delete('/profile/avatar', (req, res, next) =>
      affiliateController.removeAvatar(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AffiliateRoutes().getRoutes()
