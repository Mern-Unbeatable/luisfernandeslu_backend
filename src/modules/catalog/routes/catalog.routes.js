import { Router } from 'express'
import catalogController from '../controllers/catalog.controller.js'
import {
  categoryIdParamSchema,
  subCategoryIdParamSchema,
} from '../validations/catalog.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'

class CatalogRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    // GET /api/categories
    this.router.get('/', (req, res, next) =>
      catalogController.getCategories(req, res, next),
    )

    // GET /api/categories/:categoryId/subcategories
    this.router.get(
      '/:categoryId/subcategories',
      validate(categoryIdParamSchema, 'params'),
      (req, res, next) => catalogController.getSubCategories(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export const categoryRoutes = new CatalogRoutes().getRoutes()

class SubCategoryRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    // GET /api/subcategories/:subCategoryId/product-types
    this.router.get(
      '/:subCategoryId/product-types',
      validate(subCategoryIdParamSchema, 'params'),
      (req, res, next) => catalogController.getProductTypes(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export const subCategoryRoutes = new SubCategoryRoutes().getRoutes()

export default categoryRoutes
