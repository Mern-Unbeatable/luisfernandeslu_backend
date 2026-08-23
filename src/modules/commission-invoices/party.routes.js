import { Router } from 'express'
import commissionInvoiceController from './controller.js'
import {
  commissionInvoiceIdParamSchema,
  listCommissionInvoicesQuerySchema,
} from './validations.js'
import { validate } from '../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../middlewares/auth.middleware.js'

export function partyCommissionInvoiceRoutes(role) {
  const router = Router()
  router.use(requireAccessToken, requireRoles(role))

  router.get(
    '/',
    validate(listCommissionInvoicesQuerySchema, 'query'),
    (req, res, next) => commissionInvoiceController.list(req, res, next),
  )

  router.get(
    '/:invoiceId/pdf',
    validate(commissionInvoiceIdParamSchema, 'params'),
    (req, res, next) => commissionInvoiceController.downloadPdf(req, res, next),
  )

  router.get(
    '/:invoiceId',
    validate(commissionInvoiceIdParamSchema, 'params'),
    (req, res, next) => commissionInvoiceController.getById(req, res, next),
  )

  return router
}

export default partyCommissionInvoiceRoutes
