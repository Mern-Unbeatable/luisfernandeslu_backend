import { Router } from 'express'
import adminAffiliateTierController from '../controllers/tier.controller.js'
import {
  createTierBodySchema,
  tierIdParamSchema,
  updateTierBodySchema,
} from '../validations/tier.validation.js'
import { validate } from '../../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../../middlewares/auth.middleware.js'

/** Mounted at `/api/admin/affiliate-tiers`. */
class AdminAffiliateTierRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('admin'))

    this.router.get('/', (req, res, next) =>
      adminAffiliateTierController.list(req, res, next),
    )

    this.router.post(
      '/',
      validate(createTierBodySchema, 'body'),
      (req, res, next) => adminAffiliateTierController.create(req, res, next),
    )

    this.router.patch(
      '/:id',
      validate(tierIdParamSchema, 'params'),
      validate(updateTierBodySchema, 'body'),
      (req, res, next) => adminAffiliateTierController.update(req, res, next),
    )

    this.router.delete(
      '/:id',
      validate(tierIdParamSchema, 'params'),
      (req, res, next) => adminAffiliateTierController.remove(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AdminAffiliateTierRoutes().getRoutes()
