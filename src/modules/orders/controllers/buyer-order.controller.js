import buyerOrderService from '../services/buyer-order.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

class BuyerOrderController {
  async list(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerOrderService.list(
          req.auth,
          req.query,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerOrderService.getById(
          req.auth,
          req.params.orderId,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async track(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerOrderService.track(
          req.auth,
          req.params.orderId,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async cancel(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerOrderService.cancel(
          req.auth,
          req.params.orderId,
          req.body,
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async getInvoice(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await buyerOrderService.getInvoice(
          req.auth,
          req.params.orderId,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async downloadInvoice(req, res, next) {
    try {
      const result = await buyerOrderService.downloadInvoice(
        req.auth,
        req.params.orderId,
        resolveRequestBaseUrl(req),
      )
      const { buffer, filename, contentType } = result.file
      res.setHeader('Content-Type', contentType)
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      )
      res.setHeader('Content-Length', buffer.length)
      return res.status(200).send(buffer)
    } catch (err) {
      next(err)
    }
  }
}

export default new BuyerOrderController()
