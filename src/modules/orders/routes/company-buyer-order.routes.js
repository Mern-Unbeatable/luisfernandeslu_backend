import { Router } from 'express'
import companyBuyerOrderController from '../controllers/company-buyer-order.controller.js'
import {
  companyOrderIdParamSchema,
  listCompanyOrdersQuerySchema,
} from '../validations/company-buyer-order.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

/** Mounted at `/api/company/orders`. */
class CompanyBuyerOrderRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('company'))

    this.router.get(
      '/',
      validate(listCompanyOrdersQuerySchema, 'query'),
      (req, res, next) => companyBuyerOrderController.list(req, res, next),
    )

    this.router.get(
      '/:orderId',
      validate(companyOrderIdParamSchema, 'params'),
      (req, res, next) => companyBuyerOrderController.getById(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new CompanyBuyerOrderRoutes().getRoutes()
