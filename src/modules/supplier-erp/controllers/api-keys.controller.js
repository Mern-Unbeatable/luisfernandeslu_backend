import apiKeyService from '../services/api-key.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'

export class ApiKeysController {
  async create(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await apiKeyService.create(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async list(req, res, next) {
    try {
      return sendServiceResult(res, await apiKeyService.list(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async revoke(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await apiKeyService.revoke(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new ApiKeysController()

