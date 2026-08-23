import supplierOverviewService from '../services/supplier-overview.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'

export class SupplierOverviewController {
  async get(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await supplierOverviewService.get(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new SupplierOverviewController()
