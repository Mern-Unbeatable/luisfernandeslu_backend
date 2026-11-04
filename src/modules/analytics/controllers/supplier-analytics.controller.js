import supplierAnalyticsService from '../services/supplier-analytics.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'

export class SupplierAnalyticsController {
  async dashboard(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await supplierAnalyticsService.getDashboard(req.auth?.id),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new SupplierAnalyticsController()
