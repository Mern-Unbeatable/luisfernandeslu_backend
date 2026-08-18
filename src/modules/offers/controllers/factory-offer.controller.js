import factoryOfferService from '../services/factory-offer.service.js'
import { sendSuccess } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

function sendResult(res, result) {
  const { message, ...data } = result.body || {}
  return sendSuccess(res, result.status, data, message)
}

export class FactoryOfferController {
  async create(req, res, next) {
    try {
      const result = await factoryOfferService.create(
        req.auth,
        req.body,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async pay(req, res, next) {
    try {
      const result = await factoryOfferService.pay(
        req.auth,
        req.params.offerId,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async listOrders(req, res, next) {
    try {
      const result = await factoryOfferService.listOrders(req.auth, req.query)
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async listMessages(req, res, next) {
    try {
      const result = await factoryOfferService.listThreadMessages(
        req.auth,
        req.params.threadId,
        req.query,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }
}

export default new FactoryOfferController()
