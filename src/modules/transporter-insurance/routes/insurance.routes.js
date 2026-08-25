import { Router } from 'express'
import insuranceController from '../controllers/insurance.controller.js'
import {
  insuranceKindParamSchema,
  saveInsuranceBodySchema,
} from '../validations/insurance.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'
import {
  insuranceDocumentUpload,
  DOCUMENT_FILE_FIELDS,
} from '../../../shared/upload/evidence-upload.js'

class TransporterInsuranceRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('transporter'))

    this.router.get('/', (req, res, next) =>
      insuranceController.list(req, res, next),
    )

    this.router.post(
      '/',
      insuranceDocumentUpload.fields(DOCUMENT_FILE_FIELDS),
      validate(saveInsuranceBodySchema, 'body'),
      (req, res, next) => insuranceController.save(req, res, next),
    )

    this.router.get(
      '/:kind/pdf',
      validate(insuranceKindParamSchema, 'params'),
      (req, res, next) => insuranceController.downloadPdf(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new TransporterInsuranceRoutes().getRoutes()
