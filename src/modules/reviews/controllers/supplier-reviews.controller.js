import supplierReviewsService from '../services/supplier-reviews.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'

export class SupplierReviewsController {
  async list(req, res, next) {
    try {
      return sendServiceResult(res, await supplierReviewsService.list())
    } catch (err) {
      next(err)
    }
  }
}

export default new SupplierReviewsController()
