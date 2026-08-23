import supplierReturnsService from '../services/supplier-returns.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'

export class SupplierReturnsController {
  async list(req, res, next) {
    try {
      return sendServiceResult(res, await supplierReturnsService.list())
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await supplierReturnsService.getById(req.params.returnId),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateStatus(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await supplierReturnsService.updateStatus(
          req.params.returnId,
          req.body.status,
        ),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new SupplierReturnsController()
