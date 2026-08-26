import settingsService from '../services/settings.service.js'
import { sendServiceResult } from '../../../../utils/apiResponse.js'

export class AdminSettingsController {
  async get(req, res, next) {
    try {
      return sendServiceResult(res, await settingsService.get(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async saveShipping(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await settingsService.saveShipping(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async saveVat(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await settingsService.saveVat(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async saveAuction(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await settingsService.saveAuction(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async resetShipping(req, res, next) {
    try {
      return sendServiceResult(res, await settingsService.resetShipping(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async resetVat(req, res, next) {
    try {
      return sendServiceResult(res, await settingsService.resetVat(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async resetAuction(req, res, next) {
    try {
      return sendServiceResult(res, await settingsService.resetAuction(req.auth))
    } catch (err) {
      next(err)
    }
  }
}

export default new AdminSettingsController()
