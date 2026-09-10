import adminProfileService from '../services/admin-profile.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

export class AdminProfileController {
  async get(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminProfileService.get(req.auth, resolveRequestBaseUrl(req)),
      )
    } catch (err) {
      next(err)
    }
  }

  async update(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminProfileService.update(
          req.auth,
          req.body,
          resolveRequestBaseUrl(req),
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
        await adminProfileService.changePassword(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async saveIban(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminProfileService.saveIban(
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
        await adminProfileService.uploadAvatar(
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
        await adminProfileService.removeAvatar(
          req.auth,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new AdminProfileController()
