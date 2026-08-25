import { Router } from 'express'
import productController from '../controllers/product.controller.js'
import {
  adminListProductsQuerySchema,
  adminModerateProductBodySchema,
} from '../validations/product-list.validation.js'
import { productIdParamSchema } from '../validations/product.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

/** Mounted at `/api/admin`. */
class ProductAdminRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('admin'))

    this.router.get(
      '/products',
      validate(adminListProductsQuerySchema, 'query'),
      (req, res, next) => productController.adminList(req, res, next),
    )

    this.router.get(
      '/products/:id',
      validate(productIdParamSchema, 'params'),
      (req, res, next) => productController.adminGetById(req, res, next),
    )

    this.router.patch(
      '/products/:id',
      validate(productIdParamSchema, 'params'),
      validate(adminModerateProductBodySchema, 'body'),
      (req, res, next) => productController.adminModerate(req, res, next),
    )

    this.router.delete(
      '/products/:id',
      validate(productIdParamSchema, 'params'),
      (req, res, next) => productController.adminDelete(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new ProductAdminRoutes().getRoutes()
