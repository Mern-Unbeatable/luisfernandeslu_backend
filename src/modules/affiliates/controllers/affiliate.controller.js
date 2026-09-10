import affiliateService from '../services/affiliate.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

class AffiliateController {
  async overview(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await affiliateService.getOverview(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async referral(req, res, next) {
    try {
      return sendServiceResult(res, await affiliateService.getReferralChannel(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async clients(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await affiliateService.listReferredClients(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async levels(req, res, next) {
    try {
      return sendServiceResult(res, await affiliateService.getLevels(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async earnings(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await affiliateService.getEarnings(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async withdraw(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await affiliateService.requestWithdrawal(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async getProfile(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await affiliateService.getProfile(
          req.auth,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateProfile(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await affiliateService.updateProfile(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async changePassword(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await affiliateService.changePassword(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async getIban(req, res, next) {
    try {
      return sendServiceResult(res, await affiliateService.getIban(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async saveIban(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await affiliateService.saveIban(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async uploadAvatar(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await affiliateService.uploadAvatar(
          req.auth,
          req.files,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async removeAvatar(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await affiliateService.removeAvatar(
          req.auth,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new AffiliateController()
