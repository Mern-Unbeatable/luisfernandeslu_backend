import { Router } from 'express'
import adminFactoryController from '../controllers/factory.controller.js'
import {
  adminFactoryIdParamSchema,
  listAdminFactoriesQuerySchema,
  rejectAdminFactoryBodySchema,
  updateAdminFactoryCommissionBodySchema,
  updateAdminFactoryStatusBodySchema,
} from '../validations/factory.validation.js'
import { validate } from '../../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../../middlewares/auth.middleware.js'

/** Mounted at `/api/admin/factories`. */
class AdminFactoryRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('admin'))

    this.router.get('/stats', (req, res, next) =>
      adminFactoryController.stats(req, res, next),
    )

    this.router.get(
      '/',
      validate(listAdminFactoriesQuerySchema, 'query'),
      (req, res, next) => adminFactoryController.list(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(adminFactoryIdParamSchema, 'params'),
      (req, res, next) => adminFactoryController.getById(req, res, next),
    )

    this.router.post(
      '/:id/approve',
      validate(adminFactoryIdParamSchema, 'params'),
      (req, res, next) => adminFactoryController.approve(req, res, next),
    )

    this.router.post(
      '/:id/reject',
      validate(adminFactoryIdParamSchema, 'params'),
      validate(rejectAdminFactoryBodySchema, 'body'),
      (req, res, next) => adminFactoryController.reject(req, res, next),
    )

    this.router.patch(
      '/:id/status',
      validate(adminFactoryIdParamSchema, 'params'),
      validate(updateAdminFactoryStatusBodySchema, 'body'),
      (req, res, next) => adminFactoryController.updateStatus(req, res, next),
    )

    this.router.patch(
      '/:id/commission',
      validate(adminFactoryIdParamSchema, 'params'),
      validate(updateAdminFactoryCommissionBodySchema, 'body'),
      (req, res, next) => adminFactoryController.updateCommission(req, res, next),
    )

    this.router.delete(
      '/:id',
      validate(adminFactoryIdParamSchema, 'params'),
      (req, res, next) => adminFactoryController.remove(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AdminFactoryRoutes().getRoutes()
