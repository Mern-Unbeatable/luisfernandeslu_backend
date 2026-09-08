import factoryProfileService from '../services/factory-profile.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

export class FactoryProfileController {
  async get(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await factoryProfileService.get(req.auth, resolveRequestBaseUrl(req)),
      )
    } catch (err) {
      next(err)
    }
  }

  async update(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await factoryProfileService.update(
          req.auth,
          req.body,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async saveWarehouses(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await factoryProfileService.saveWarehouses(
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
        await factoryProfileService.changePassword(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async saveIban(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await factoryProfileService.saveIban(
          req.auth,
          req.body,
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
        await factoryProfileService.resubmitDocuments(req.auth, req.files),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new FactoryProfileController()
