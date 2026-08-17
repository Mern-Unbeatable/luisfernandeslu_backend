import companyOrderService from '../services/company-order.service.js'
import { sendSuccess } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

function sendResult(res, result) {
  const { message, ...data } = result.body || {}
  return sendSuccess(res, result.status, data, message)
}

export class CompanyOrderController {
  async stats(req, res, next) {
    try {
      return sendResult(
        res,
        await companyOrderService.getStats(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async companies(req, res, next) {
    try {
      return sendResult(
        res,
        await companyOrderService.listCompanies(req.auth),
      )
    } catch (err) {
      next(err)
    }
  }

  async listDirect(req, res, next) {
    try {
      return sendResult(
        res,
        await companyOrderService.listDirect(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async listChat(req, res, next) {
    try {
      return sendResult(
        res,
        await companyOrderService.listChat(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendResult(
        res,
        await companyOrderService.getById(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateStatus(req, res, next) {
    try {
      return sendResult(
        res,
        await companyOrderService.updateStatus(
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
      const result = await companyOrderService.downloadInvoice(
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

export default new CompanyOrderController()
