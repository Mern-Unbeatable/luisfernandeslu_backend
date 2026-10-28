import supplierDeliveryService from './supplier-delivery.service.js'
import { sendServiceResult } from '../../utils/apiResponse.js'

export class SupplierDeliveryController {
  async list(req, res, next) {
    try {
      return sendServiceResult(res, await supplierDeliveryService.list(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async chooseSelf(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await supplierDeliveryService.chooseSelf(req.auth, req.params.orderId),
      )
    } catch (err) {
      next(err)
    }
  }

  async chooseCarrier(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await supplierDeliveryService.chooseCarrier(req.auth, req.params.orderId),
      )
    } catch (err) {
      next(err)
    }
  }

  async markDelivered(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await supplierDeliveryService.markDelivered(req.auth, req.params.orderId),
      )
    } catch (err) {
      next(err)
    }
  }

  async earnings(req, res, next) {
    try {
      return sendServiceResult(res, await supplierDeliveryService.earnings(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async withdraw(req, res, next) {
    try {
      return sendServiceResult(res, await supplierDeliveryService.withdraw(req.auth, req.body))
    } catch (err) {
      next(err)
    }
  }

  async listForAdmin(req, res, next) {
    try {
      return sendServiceResult(res, await supplierDeliveryService.listForAdmin(req.query))
    } catch (err) {
      next(err)
    }
  }
}

export default new SupplierDeliveryController()
