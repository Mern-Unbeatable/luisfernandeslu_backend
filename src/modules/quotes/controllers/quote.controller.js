import quoteService from '../services/quote.service.js'
import { sendSuccess } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

function sendResult(res, result) {
  const { message, ...data } = result.body || {}
  return sendSuccess(res, result.status, data, message)
}

export class QuoteController {
  async createForProduct(req, res, next) {
    try {
      const result = await quoteService.createForProduct(
        req.auth,
        req.params.id,
        req.body,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async list(req, res, next) {
    try {
      const result = await quoteService.list(
        req.auth,
        req.query,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      const result = await quoteService.getById(
        req.auth,
        req.params.id,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async listMessages(req, res, next) {
    try {
      const result = await quoteService.listMessages(
        req.auth,
        req.params.id,
        req.query,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async sendMessage(req, res, next) {
    try {
      const result = await quoteService.sendMessage(
        req.auth,
        req.params.id,
        req.body,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async createOffer(req, res, next) {
    try {
      const result = await quoteService.createOffer(
        req.auth,
        req.params.id,
        req.body,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async negotiateOffer(req, res, next) {
    try {
      const result = await quoteService.negotiateOffer(
        req.auth,
        req.params.id,
        req.params.offerId,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async acceptOffer(req, res, next) {
    try {
      const result = await quoteService.acceptOffer(
        req.auth,
        req.params.id,
        req.params.offerId,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async payOffer(req, res, next) {
    try {
      const result = await quoteService.payOffer(
        req.auth,
        req.params.id,
        req.params.offerId,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }
}

export default new QuoteController()
