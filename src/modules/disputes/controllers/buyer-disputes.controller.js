import buyerDisputesService from '../services/buyer-disputes.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'
import { mergeEvidence } from '../../../shared/upload/evidence-upload.js'

export class BuyerDisputesController {
  async listOrders(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerDisputesService.listOrders(
          req.auth,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async list(req, res, next) {
    try {
      return sendServiceResult(res, await buyerDisputesService.list())
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerDisputesService.getById(req.params.disputeId),
      )
    } catch (err) {
      next(err)
    }
  }

  async create(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerDisputesService.create(
          req.auth,
          mergeEvidence(req.body, req.files, resolveRequestBaseUrl(req)),
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new BuyerDisputesController()
