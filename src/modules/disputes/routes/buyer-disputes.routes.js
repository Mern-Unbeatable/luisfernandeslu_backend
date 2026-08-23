import { Router } from 'express'
import buyerDisputesController from '../controllers/buyer-disputes.controller.js'
import {
  createDisputeBodySchema,
  disputeIdParamSchema,
} from '../validations/disputes.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'
import {
  disputeEvidenceUpload,
  EVIDENCE_FILE_FIELDS,
} from '../../../shared/upload/evidence-upload.js'

class BuyerDisputesRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('customer', 'company'))

    this.router.get('/orders', (req, res, next) =>
      buyerDisputesController.listOrders(req, res, next),
    )

    this.router.get('/', (req, res, next) =>
      buyerDisputesController.list(req, res, next),
    )

    this.router.post(
      '/',
      disputeEvidenceUpload.fields(EVIDENCE_FILE_FIELDS),
      validate(createDisputeBodySchema, 'body'),
      (req, res, next) => buyerDisputesController.create(req, res, next),
    )

    this.router.get(
      '/:disputeId',
      validate(disputeIdParamSchema, 'params'),
      (req, res, next) => buyerDisputesController.getById(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new BuyerDisputesRoutes().getRoutes()
