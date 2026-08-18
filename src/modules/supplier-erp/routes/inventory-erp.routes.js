import { Router } from 'express'
import inventoryController from '../controllers/inventory-erp.controller.js'
import {
  createInventoryBodySchema,
  inventoryIdParamSchema,
  listInventoryQuerySchema,
  restockBodySchema,
} from '../../inventory/validations/inventory.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireSupplierErpApiKey,
  requireSupplierErpApiKeyResolved,
} from '../../../middlewares/erpApiKey.middleware.js'

class InventoryErpRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireSupplierErpApiKey, requireSupplierErpApiKeyResolved)

    this.router.get(
      '/',
      validate(listInventoryQuerySchema, 'query'),
      (req, res, next) => inventoryController.list(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(inventoryIdParamSchema, 'params'),
      (req, res, next) => inventoryController.getById(req, res, next),
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

export default new InventoryErpRoutes().getRoutes()

