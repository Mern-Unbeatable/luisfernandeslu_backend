import { Router } from 'express'
import customerOrderController from '../controllers/customer-order.controller.js'
import {
  listCustomerOrdersQuerySchema,
  orderIdParamSchema,
  updateOrderStatusBodySchema,
} from '../validations/customer-order.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class CustomerOrderRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.get('/stats', (req, res, next) =>
      customerOrderController.stats(req, res, next),
    )

    this.router.get(
      '/',
      validate(listCustomerOrdersQuerySchema, 'query'),
      (req, res, next) => customerOrderController.list(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(orderIdParamSchema, 'params'),
      (req, res, next) => customerOrderController.getById(req, res, next),
    )

    this.router.get(
      '/:id/invoice',
      validate(orderIdParamSchema, 'params'),
      (req, res, next) =>
        customerOrderController.downloadInvoice(req, res, next),
    )

    this.router.patch(
      '/:id/status',
      validate(orderIdParamSchema, 'params'),
      validate(updateOrderStatusBodySchema, 'body'),
      (req, res, next) => customerOrderController.updateStatus(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new CustomerOrderRoutes().getRoutes()
