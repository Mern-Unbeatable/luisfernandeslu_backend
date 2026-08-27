import companyBuyerOrderService from '../services/company-buyer-order.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'

class CompanyBuyerOrderController {
  async list(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await companyBuyerOrderService.list(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await companyBuyerOrderService.getById(req.auth, req.params.orderId),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new CompanyBuyerOrderController()
