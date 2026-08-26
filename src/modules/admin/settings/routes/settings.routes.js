import { Router } from 'express'
import settingsController from '../controllers/settings.controller.js'
import {
  saveAuctionBodySchema,
  saveShippingBodySchema,
  saveVatBodySchema,
} from '../validations/settings.validation.js'
import { validate } from '../../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../../middlewares/auth.middleware.js'

/** Mounted at `/api/admin/settings`. */
class AdminSettingsRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('admin'))

    this.router.get('/', (req, res, next) =>
      settingsController.get(req, res, next),
    )

    this.router.put(
      '/shipping',
      validate(saveShippingBodySchema, 'body'),
      (req, res, next) => settingsController.saveShipping(req, res, next),
    )
    this.router.post('/shipping/reset', (req, res, next) =>
      settingsController.resetShipping(req, res, next),
    )

    this.router.put(
      '/vat',
      validate(saveVatBodySchema, 'body'),
      (req, res, next) => settingsController.saveVat(req, res, next),
    )
    this.router.post('/vat/reset', (req, res, next) =>
      settingsController.resetVat(req, res, next),
    )

    this.router.put(
      '/auction',
      validate(saveAuctionBodySchema, 'body'),
      (req, res, next) => settingsController.saveAuction(req, res, next),
    )
    this.router.post('/auction/reset', (req, res, next) =>
      settingsController.resetAuction(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AdminSettingsRoutes().getRoutes()
