import { Router } from 'express'
import supplierProfileController from '../controllers/supplier-profile.controller.js'
import {
  changeSupplierPasswordBodySchema,
  saveSupplierEupagoBodySchema,
  saveSupplierIbanBodySchema,
  saveSupplierWarehousesBodySchema,
  updateSupplierProfileBodySchema,
} from '../validations/supplier-profile.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'
import { resubmitUpload } from '../upload.js'
import {
  avatarUpload,
  AVATAR_FILE_FIELDS,
} from '../../../shared/upload/evidence-upload.js'

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

    this.router.put(
      '/eupago',
      validate(saveSupplierEupagoBodySchema, 'body'),
      (req, res, next) => supplierProfileController.saveEupago(req, res, next),
    )

    this.router.post(
      '/avatar',
      avatarUpload.fields(AVATAR_FILE_FIELDS),
      (req, res, next) =>
        supplierProfileController.uploadAvatar(req, res, next),
    )

    this.router.delete('/avatar', (req, res, next) =>
      supplierProfileController.removeAvatar(req, res, next),
    )

    this.router.post(
      '/resubmit-documents',
      resubmitUpload.any(),
      (req, res, next) => supplierProfileController.resubmitDocuments(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new SupplierProfileRoutes().getRoutes()
