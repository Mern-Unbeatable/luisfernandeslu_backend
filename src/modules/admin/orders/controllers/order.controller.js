import adminOrderService from '../services/order.service.js'
import { sendServiceResult } from '../../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../../lib/requestUrl.js'

class AdminOrderController {
  async list(req, res, next) {
    try {
      return sendServiceResult(res, await adminOrderService.list(req.auth, req.query))
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminOrderService.getById(
          req.auth,
          req.params.id,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateStatus(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminOrderService.updateStatus(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async adminDelete(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminOrderService.adminDelete(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new AdminOrderController()
