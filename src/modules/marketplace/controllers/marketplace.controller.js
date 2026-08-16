import marketplaceService from '../services/marketplace.service.js'
import { sendSuccess } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

function sendResult(res, result) {
  const { message, ...data } = result.body || {}
  return sendSuccess(res, result.status, data, message)
}

export class MarketplaceController {
  async list(req, res, next) {
    try {
      const result = await marketplaceService.list(
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
      const result = await marketplaceService.getById(
        req.auth,
        req.params.id,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }
}

export default new MarketplaceController()
