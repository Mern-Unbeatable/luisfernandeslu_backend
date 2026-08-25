import adminAffiliateService from '../services/affiliate.service.js'
import { sendServiceResult } from '../../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../../lib/requestUrl.js'

export class AdminAffiliateController {
  async stats(req, res, next) {
    try {
      return sendServiceResult(res, await adminAffiliateService.stats(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async list(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminAffiliateService.list(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminAffiliateService.getById(
          req.auth,
          req.params.id,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateStatus(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminAffiliateService.updateStatus(
          req.auth,
          req.params.id,
          req.body,
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async remove(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminAffiliateService.remove(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async listClients(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminAffiliateService.listClients(
          req.auth,
          req.params.id,
          req.query,
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async analytics(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminAffiliateService.analytics(
          req.auth,
          req.params.id,
          req.query,
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async listCommissions(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminAffiliateService.listCommissions(
          req.auth,
          req.params.id,
          req.query,
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async listPayouts(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminAffiliateService.listPayouts(
          req.auth,
          req.params.id,
          req.query,
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async listPayoutRequests(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminAffiliateService.listPayoutRequests(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async updatePayoutStatus(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminAffiliateService.updatePayoutStatus(
          req.auth,
          req.params.payoutId,
          req.body,
        ),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new AdminAffiliateController()
