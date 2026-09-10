import { Router } from 'express'
import factoryProfileController from '../controllers/factory-profile.controller.js'
import {
  changeFactoryPasswordBodySchema,
  saveFactoryEupagoBodySchema,
  saveFactoryIbanBodySchema,
  saveFactoryWarehousesBodySchema,
  updateFactoryProfileBodySchema,
} from '../validations/factory-profile.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'
import { resubmitUpload } from '../upload.js'

class FactoryProfileRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('factory'))

    this.router.get('/', (req, res, next) =>
      factoryProfileController.get(req, res, next),
    )

    this.router.patch(
      '/',
      validate(updateFactoryProfileBodySchema, 'body'),
      (req, res, next) => factoryProfileController.update(req, res, next),
    )

    this.router.put(
      '/warehouses',
      validate(saveFactoryWarehousesBodySchema, 'body'),
      (req, res, next) =>
        factoryProfileController.saveWarehouses(req, res, next),
    )

    this.router.post(
      '/password',
      validate(changeFactoryPasswordBodySchema, 'body'),
      (req, res, next) =>
        factoryProfileController.changePassword(req, res, next),
    )

    this.router.put(
      '/iban',
      validate(saveFactoryIbanBodySchema, 'body'),
      (req, res, next) => factoryProfileController.saveIban(req, res, next),
    )

    this.router.put(
      '/eupago',
      validate(saveFactoryEupagoBodySchema, 'body'),
      (req, res, next) => factoryProfileController.saveEupago(req, res, next),
    )

    this.router.post(
      '/resubmit-documents',
      resubmitUpload.any(),
      (req, res, next) => factoryProfileController.resubmitDocuments(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new FactoryProfileRoutes().getRoutes()
