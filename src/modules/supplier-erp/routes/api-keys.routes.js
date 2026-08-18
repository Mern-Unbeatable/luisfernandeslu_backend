import { Router } from 'express'
import apiKeysController from '../controllers/api-keys.controller.js'
import {
  apiKeyIdParamSchema,
  createApiKeyBodySchema,
} from '../validations/api-keys.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class ApiKeysRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.post(
      '/',
      validate(createApiKeyBodySchema, 'body'),
      (req, res, next) => apiKeysController.create(req, res, next),
    )

    this.router.get(
      '/',
      (req, res, next) => apiKeysController.list(req, res, next),
    )

    this.router.delete(
      '/:id',
      validate(apiKeyIdParamSchema, 'params'),
      (req, res, next) => apiKeysController.revoke(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new ApiKeysRoutes().getRoutes()

