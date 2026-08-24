import deliveryService from '../services/delivery.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'
import { mergeDeliveryProof } from '../../../shared/upload/evidence-upload.js'

class DeliveryController {
  async listForTransporter(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await deliveryService.listForTransporter(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async listCompletedForTransporter(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await deliveryService.listCompletedForTransporter(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async getForTransporter(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await deliveryService.getForTransporter(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateStatus(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await deliveryService.updateStatus(
          req.auth,
          req.params.id,
          req.body.action,
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async verifyOtp(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await deliveryService.verifyOtp(
          req.auth,
          req.params.id,
          req.body.otp,
          mergeDeliveryProof(req.body, req.files),
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async listForBuyer(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await deliveryService.listForBuyer(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async getForBuyer(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await deliveryService.getForBuyer(req.auth, req.params.orderId),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new DeliveryController()
