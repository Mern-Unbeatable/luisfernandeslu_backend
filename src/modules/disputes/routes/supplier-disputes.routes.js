import { Router } from 'express'
import staffDisputesController from '../controllers/staff-disputes.controller.js'
import {
  disputeIdParamSchema,
  updateDisputeStatusBodySchema,
} from '../validations/disputes.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class SupplierDisputesRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.get('/', (req, res, next) =>
      staffDisputesController.list(req, res, next),
    )

    this.router.get(
      '/:disputeId',
      validate(disputeIdParamSchema, 'params'),
      (req, res, next) => staffDisputesController.getById(req, res, next),
    )

    this.router.patch(
      '/:disputeId/status',
      validate(disputeIdParamSchema, 'params'),
      validate(updateDisputeStatusBodySchema, 'body'),
      (req, res, next) => staffDisputesController.updateStatus(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new SupplierDisputesRoutes().getRoutes()
