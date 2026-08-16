import { Router } from 'express'
import addressController from '../controllers/address.controller.js'
import {
  addressIdParamSchema,
  createAddressBodySchema,
  updateAddressBodySchema,
} from '../validations/address.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class AddressRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('customer', 'company'))

    this.router.get('/', (req, res, next) =>
      addressController.list(req, res, next),
    )

    this.router.post(
      '/',
      validate(createAddressBodySchema, 'body'),
      (req, res, next) => addressController.create(req, res, next),
    )

    this.router.patch(
      '/:id',
      validate(addressIdParamSchema, 'params'),
      validate(updateAddressBodySchema, 'body'),
      (req, res, next) => addressController.update(req, res, next),
    )

    this.router.delete(
      '/:id',
      validate(addressIdParamSchema, 'params'),
      (req, res, next) => addressController.remove(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AddressRoutes().getRoutes()
