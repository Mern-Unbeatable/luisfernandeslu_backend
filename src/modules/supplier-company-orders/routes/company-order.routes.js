import { Router } from 'express'
import companyOrderController from '../controllers/company-order.controller.js'
import {
  listCompanyOrdersQuerySchema,
  orderIdParamSchema,
  statsQuerySchema,
  updateOrderStatusBodySchema,
} from '../validations/company-order.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class CompanyOrderRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.get(
      '/stats',
      validate(statsQuerySchema, 'query'),
      (req, res, next) => companyOrderController.stats(req, res, next),
    )

    this.router.get('/companies', (req, res, next) =>
      companyOrderController.companies(req, res, next),
    )

    this.router.get(
      '/direct',
      validate(listCompanyOrdersQuerySchema, 'query'),
      (req, res, next) => companyOrderController.listDirect(req, res, next),
    )

    this.router.get(
      '/chat',
      validate(listCompanyOrdersQuerySchema, 'query'),
      (req, res, next) => companyOrderController.listChat(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(orderIdParamSchema, 'params'),
      (req, res, next) => companyOrderController.getById(req, res, next),
    )

    this.router.get(
      '/:id/invoice',
      validate(orderIdParamSchema, 'params'),
      (req, res, next) =>
        companyOrderController.downloadInvoice(req, res, next),
    )

    this.router.patch(
      '/:id/status',
      validate(orderIdParamSchema, 'params'),
      validate(updateOrderStatusBodySchema, 'body'),
      (req, res, next) => companyOrderController.updateStatus(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new CompanyOrderRoutes().getRoutes()
