import buyerReturnsService from '../services/buyer-returns.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'
import { mergeEvidence } from '../../../shared/upload/evidence-upload.js'

export class BuyerReturnsController {
  async listOrders(req, res, next) {
    try {
      return sendServiceResult(res, await buyerReturnsService.listOrders())
    } catch (err) {
      next(err)
    }
  }

  async getOrder(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerReturnsService.getOrder(req.params.orderId),
      )
    } catch (err) {
      next(err)
    }
  }

  async listRequests(req, res, next) {
    try {
      return sendServiceResult(res, await buyerReturnsService.listRequests())
    } catch (err) {
      next(err)
    }
  }

  async getRequest(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerReturnsService.getRequest(req.params.returnId),
      )
    } catch (err) {
      next(err)
    }
  }

  async createRequest(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerReturnsService.createRequest(
          req.auth,
          mergeEvidence(req.body, req.files, resolveRequestBaseUrl(req)),
        ),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new BuyerReturnsController()
