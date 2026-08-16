import { Router } from 'express'
import cartController from '../controllers/cart.controller.js'
import {
  addCartItemBodySchema,
  updateCartItemBodySchema,
  cartItemIdParamSchema,
} from '../validations/cart.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

class CartRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('customer', 'company'))

    this.router.get('/', (req, res, next) =>
      cartController.getCart(req, res, next),
    )

    this.router.post(
      '/items',
      validate(addCartItemBodySchema, 'body'),
      (req, res, next) => cartController.addItem(req, res, next),
    )

    this.router.patch(
      '/items/:id',
      validate(cartItemIdParamSchema, 'params'),
      validate(updateCartItemBodySchema, 'body'),
      (req, res, next) => cartController.updateItem(req, res, next),
    )

    this.router.delete(
      '/items/:id',
      validate(cartItemIdParamSchema, 'params'),
      (req, res, next) => cartController.removeItem(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new CartRoutes().getRoutes()
