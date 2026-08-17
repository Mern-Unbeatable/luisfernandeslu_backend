import customerOrderService from '../services/customer-order.service.js'
import { sendSuccess } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

function sendResult(res, result) {
  const { message, ...data } = result.body || {}
  return sendSuccess(res, result.status, data, message)
}

export class CustomerOrderController {
  async stats(req, res, next) {
    try {
      return sendResult(res, await customerOrderService.getStats(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async list(req, res, next) {
    try {
      return sendResult(
        res,
        await customerOrderService.list(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendResult(
        res,
        await customerOrderService.getById(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateStatus(req, res, next) {
    try {
      return sendResult(
        res,
        await customerOrderService.updateStatus(
          req.auth,
          req.params.id,
          req.body,
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async downloadInvoice(req, res, next) {
    try {
      const result = await customerOrderService.downloadInvoice(
        req.auth,
        req.params.id,
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

export default new CustomerOrderController()
