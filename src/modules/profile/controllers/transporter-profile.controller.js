import transporterProfileService from '../services/transporter-profile.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

export class TransporterProfileController {
  async get(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await transporterProfileService.get(
          req.auth,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async update(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await transporterProfileService.update(
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
        await transporterProfileService.changePassword(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async saveIban(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await transporterProfileService.saveIban(
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
        await transporterProfileService.uploadAvatar(
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
        await transporterProfileService.removeAvatar(
          req.auth,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async resubmitDocuments(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await transporterProfileService.resubmitDocuments(req.auth, req.files),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new TransporterProfileController()
