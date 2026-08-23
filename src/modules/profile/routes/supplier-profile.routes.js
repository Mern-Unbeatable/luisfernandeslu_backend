import { Router } from 'express'
import supplierProfileController from '../controllers/supplier-profile.controller.js'
import {
  changeSupplierPasswordBodySchema,
  saveSupplierIbanBodySchema,
  saveSupplierWarehousesBodySchema,
  updateSupplierProfileBodySchema,
} from '../validations/supplier-profile.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class SupplierProfileRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.get('/', (req, res, next) =>
      supplierProfileController.get(req, res, next),
    )

    this.router.patch(
      '/',
      validate(updateSupplierProfileBodySchema, 'body'),
      (req, res, next) => supplierProfileController.update(req, res, next),
    )

    this.router.put(
      '/warehouses',
      validate(saveSupplierWarehousesBodySchema, 'body'),
      (req, res, next) =>
        supplierProfileController.saveWarehouses(req, res, next),
    )

    this.router.post(
      '/password',
      validate(changeSupplierPasswordBodySchema, 'body'),
      (req, res, next) =>
        supplierProfileController.changePassword(req, res, next),
    )

    this.router.put(
      '/iban',
      validate(saveSupplierIbanBodySchema, 'body'),
      (req, res, next) => supplierProfileController.saveIban(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new SupplierProfileRoutes().getRoutes()
