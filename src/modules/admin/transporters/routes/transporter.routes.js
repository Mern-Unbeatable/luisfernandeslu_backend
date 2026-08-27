import { Router } from 'express'
import adminTransporterController from '../controllers/transporter.controller.js'
import {
  adminTransporterIdParamSchema,
  adminTransporterInsuranceParamSchema,
  listAdminTransportersQuerySchema,
  rejectAdminTransporterBodySchema,
  rejectAdminInsuranceBodySchema,
  updateAdminTransporterCommissionBodySchema,
  updateAdminTransporterStatusBodySchema,
} from '../validations/transporter.validation.js'
import { validate } from '../../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../../middlewares/auth.middleware.js'

/** Mounted at `/api/admin/transporters`. */
class AdminTransporterRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('admin'))

    this.router.get('/stats', (req, res, next) =>
      adminTransporterController.stats(req, res, next),
    )

    this.router.get(
      '/',
      validate(listAdminTransportersQuerySchema, 'query'),
      (req, res, next) => adminTransporterController.list(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(adminTransporterIdParamSchema, 'params'),
      (req, res, next) => adminTransporterController.getById(req, res, next),
    )

    this.router.post(
      '/:id/approve',
      validate(adminTransporterIdParamSchema, 'params'),
      (req, res, next) => adminTransporterController.approve(req, res, next),
    )

    this.router.post(
      '/:id/reject',
      validate(adminTransporterIdParamSchema, 'params'),
      validate(rejectAdminTransporterBodySchema, 'body'),
      (req, res, next) => adminTransporterController.reject(req, res, next),
    )

    this.router.post(
      '/:id/insurance/:kind/verify',
      validate(adminTransporterInsuranceParamSchema, 'params'),
      (req, res, next) =>
        adminTransporterController.verifyInsurance(req, res, next),
    )

    this.router.post(
      '/:id/insurance/:kind/reject',
      validate(adminTransporterInsuranceParamSchema, 'params'),
      validate(rejectAdminInsuranceBodySchema, 'body'),
      (req, res, next) =>
        adminTransporterController.rejectInsurance(req, res, next),
    )

    this.router.patch(
      '/:id/status',
      validate(adminTransporterIdParamSchema, 'params'),
      validate(updateAdminTransporterStatusBodySchema, 'body'),
      (req, res, next) => adminTransporterController.updateStatus(req, res, next),
    )

    this.router.patch(
      '/:id/commission',
      validate(adminTransporterIdParamSchema, 'params'),
      validate(updateAdminTransporterCommissionBodySchema, 'body'),
      (req, res, next) => adminTransporterController.updateCommission(req, res, next),
    )

    this.router.delete(
      '/:id',
      validate(adminTransporterIdParamSchema, 'params'),
      (req, res, next) => adminTransporterController.remove(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AdminTransporterRoutes().getRoutes()
