import adminLogisticsService from '../services/logistics.service.js'
import { sendServiceResult } from '../../../../utils/apiResponse.js'

class AdminLogisticsController {
  async list(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminLogisticsService.list(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminLogisticsService.getById(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new AdminLogisticsController()
