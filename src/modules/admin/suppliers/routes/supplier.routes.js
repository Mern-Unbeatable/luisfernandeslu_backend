import { Router } from 'express'
import adminSupplierController from '../controllers/supplier.controller.js'
import {
  adminSupplierIdParamSchema,
  listAdminSuppliersQuerySchema,
  rejectAdminSupplierBodySchema,
  updateAdminSupplierCommissionBodySchema,
  updateAdminSupplierStatusBodySchema,
} from '../validations/supplier.validation.js'
import { validate } from '../../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../../middlewares/auth.middleware.js'

/** Mounted at `/api/admin/suppliers`. */
class AdminSupplierRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('admin'))

    this.router.get('/stats', (req, res, next) =>
      adminSupplierController.stats(req, res, next),
    )

    this.router.get(
      '/',
      validate(listAdminSuppliersQuerySchema, 'query'),
      (req, res, next) => adminSupplierController.list(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(adminSupplierIdParamSchema, 'params'),
      (req, res, next) => adminSupplierController.getById(req, res, next),
    )

    this.router.post(
      '/:id/approve',
      validate(adminSupplierIdParamSchema, 'params'),
      (req, res, next) => adminSupplierController.approve(req, res, next),
    )

    this.router.post(
      '/:id/reject',
      validate(adminSupplierIdParamSchema, 'params'),
      validate(rejectAdminSupplierBodySchema, 'body'),
      (req, res, next) => adminSupplierController.reject(req, res, next),
    )

    this.router.patch(
      '/:id/status',
      validate(adminSupplierIdParamSchema, 'params'),
      validate(updateAdminSupplierStatusBodySchema, 'body'),
      (req, res, next) => adminSupplierController.updateStatus(req, res, next),
    )

    this.router.patch(
      '/:id/commission',
      validate(adminSupplierIdParamSchema, 'params'),
      validate(updateAdminSupplierCommissionBodySchema, 'body'),
      (req, res, next) => adminSupplierController.updateCommission(req, res, next),
    )

    this.router.delete(
      '/:id',
      validate(adminSupplierIdParamSchema, 'params'),
      (req, res, next) => adminSupplierController.remove(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AdminSupplierRoutes().getRoutes()
