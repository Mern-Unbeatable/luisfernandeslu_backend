import { Router } from 'express'
import inventoryController from '../controllers/inventory.controller.js'
import {
  createInventoryBodySchema,
  inventoryIdParamSchema,
  listInventoryQuerySchema,
  restockBodySchema,
} from '../validations/inventory.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class InventoryRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('supplier'))

    this.router.get(
      '/stats',
      (req, res, next) => inventoryController.stats(req, res, next),
    )

    this.router.get(
      '/',
      validate(listInventoryQuerySchema, 'query'),
      (req, res, next) => inventoryController.list(req, res, next),
    )

    this.router.post(
      '/',
      validate(createInventoryBodySchema, 'body'),
      (req, res, next) => inventoryController.create(req, res, next),
    )

    this.router.patch(
      '/:id/restock',
      validate(inventoryIdParamSchema, 'params'),
      validate(restockBodySchema, 'body'),
      (req, res, next) => inventoryController.restock(req, res, next),
    )

    this.router.delete(
      '/:id',
      validate(inventoryIdParamSchema, 'params'),
      (req, res, next) => inventoryController.remove(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new InventoryRoutes().getRoutes()
