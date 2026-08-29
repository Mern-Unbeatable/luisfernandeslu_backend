import factoryOverviewService from '../services/factory-overview.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'

export class FactoryOverviewController {
  async get(req, res, next) {
    try {
      return sendServiceResult(res, await factoryOverviewService.get(req.auth))
    } catch (err) {
      next(err)
    }
  }
}

export default new FactoryOverviewController()
