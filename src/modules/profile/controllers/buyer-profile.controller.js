import buyerProfileService from '../services/buyer-profile.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

class BuyerProfileController {
  async get(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerProfileService.get(req.auth, resolveRequestBaseUrl(req)),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateAccount(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerProfileService.updateAccount(
          req.auth,
          req.body,
          resolveRequestBaseUrl(req),
          req.files,
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async changePassword(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerProfileService.changePassword(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async saveIban(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerProfileService.saveIban(
          req.auth,
          req.body,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async saveBillingAddress(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerProfileService.saveBillingAddress(
          req.auth,
          req.body,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async saveShippingAddress(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerProfileService.saveShippingAddress(
          req.auth,
          req.body,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async uploadAvatar(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerProfileService.uploadAvatar(
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
        await buyerProfileService.removeAvatar(
          req.auth,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new BuyerProfileController()
