import checkoutService from '../services/checkout.service.js'
import { sendSuccess } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

function sendResult(res, result) {
  const { message, ...data } = result.body || {}
  return sendSuccess(res, result.status, data, message)
}

export class CheckoutController {
  async quoteDirectBuy(req, res, next) {
    try {
      return sendResult(
        res,
        await checkoutService.quoteDirectBuy(req.auth, req.body, resolveRequestBaseUrl(req)),
      )
    } catch (err) {
      next(err)
    }
  }

  async quoteShipping(req, res, next) {
    try {
      return sendResult(
        res,
        await checkoutService.quoteShipping(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async place(req, res, next) {
    try {
      return sendResult(
        res,
        await checkoutService.place(
          req.auth,
          req.body,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendResult(
        res,
        await checkoutService.getById(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async confirmPay(req, res, next) {
    try {
      return sendResult(
        res,
        await checkoutService.confirmPayment(
          req.auth,
          req.params.id,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async eupagoWebhook(req, res, next) {
    try {
      return sendResult(
        res,
        await checkoutService.handleEupagoWebhook(req.body || {}, req.query || {}),
      )
    } catch (err) {
      next(err)
    }
  }

  async suggestLocations(req, res, next) {
    try {
      return sendResult(
        res,
        await checkoutService.suggestLocations(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new CheckoutController()
