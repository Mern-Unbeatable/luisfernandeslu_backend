import cartService from '../services/cart.service.js'
import { sendSuccess } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

function sendResult(res, result) {
  const { message, ...data } = result.body || {}
  return sendSuccess(res, result.status, data, message)
}

export class CartController {
  async getCart(req, res, next) {
    try {
      const result = await cartService.getCart(
        req.auth,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async addItem(req, res, next) {
    try {
      const result = await cartService.addItem(req.auth, req.body)
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async updateItem(req, res, next) {
    try {
      const result = await cartService.updateItem(
        req.auth,
        req.params.id,
        req.body,
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async removeItem(req, res, next) {
    try {
      const result = await cartService.removeItem(req.auth, req.params.id)
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async applyPromo(req, res, next) {
    try {
      const result = await cartService.applyPromoCode(
        req.auth,
        req.body,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async removePromo(req, res, next) {
    try {
      const result = await cartService.removePromoCode(
        req.auth,
        { ...req.body, ...req.query },
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }
}

export default new CartController()
