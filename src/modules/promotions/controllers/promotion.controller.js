import promotionService from '../services/promotion.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

export class PromotionController {
  async listPlans(req, res, next) {
    try {
      return sendServiceResult(res, await promotionService.listActivePlans())
    } catch (err) {
      next(err)
    }
  }

  async requestPromotion(req, res, next) {
    try {
      const result = await promotionService.requestPromotion(
        req.auth,
        req.params.id,
        req.body.planId,
      )
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async confirmPayment(req, res, next) {
    try {
      const result = await promotionService.confirmPayment(
        req.auth,
        req.params.id,
        req.params.promotionId,
        req.body.paymentRef,
      )
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async adminListPlans(req, res, next) {
    try {
      return sendServiceResult(res, await promotionService.adminListPlans())
    } catch (err) {
      next(err)
    }
  }

  async upsertPlan(req, res, next) {
    try {
      return sendServiceResult(res, await promotionService.upsertPlan(req.body))
    } catch (err) {
      next(err)
    }
  }

  async updatePlan(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await promotionService.updatePlan(req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async adminList(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await promotionService.adminList(req.query, resolveRequestBaseUrl(req)),
      )
    } catch (err) {
      next(err)
    }
  }

  async adminModerate(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await promotionService.adminModerate(req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new PromotionController()
