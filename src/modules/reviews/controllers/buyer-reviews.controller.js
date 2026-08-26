import buyerReviewsService from '../services/buyer-reviews.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

class BuyerReviewsController {
  async listPending(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerReviewsService.listPending(
          req.auth,
          req.query,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async getPending(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerReviewsService.getPending(
          req.auth,
          req.params.id,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async create(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerReviewsService.create(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new BuyerReviewsController()
