import marketplaceService from '../services/marketplace.service.js'
import { sendSuccess } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

function sendResult(res, result) {
  const { message, ...data } = result.body || {}
  return sendSuccess(res, result.status, data, message)
}

export class MarketplaceController {
  async listSponsored(req, res, next) {
    try {
      return sendResult(
        res,
        await marketplaceService.listSponsored(
          req.auth,
          req.query,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async listTopSelling(req, res, next) {
    try {
      return sendResult(
        res,
        await marketplaceService.listTopSelling(
          req.auth,
          req.query,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

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

  async getBySlug(req, res, next) {
    try {
      const result = await marketplaceService.getBySlug(
        req.auth,
        req.params.slug,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }
}

export default new MarketplaceController()
