import documentService from '../services/document.service.js'
import { sendSuccess } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

function sendResult(res, result) {
  const { message, ...data } = result.body || {}
  return sendSuccess(res, result.status, data, message)
}

function sendPdf(res, result) {
  const { buffer, filename, contentType } = result.file
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Content-Length', buffer.length)
  return res.status(200).send(buffer)
}

export class SupplierDocumentController {
  async stats(req, res, next) {
    try {
      return sendResult(res, await documentService.getStats(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async list(req, res, next) {
    try {
      return sendResult(
        res,
        await documentService.list(req.auth, req.query, resolveRequestBaseUrl(req)),
      )
    } catch (err) {
      next(err)
    }
  }

  async eligibleOrders(req, res, next) {
    try {
      return sendResult(
        res,
        await documentService.listEligibleOrders(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendResult(
        res,
        await documentService.getById(
          req.auth,
          req.params.id,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async generate(req, res, next) {
    try {
      return sendResult(
        res,
        await documentService.generate(
          req.auth,
          req.body,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async download(req, res, next) {
    try {
      const result = await documentService.downloadPdf(
        req.auth,
        req.params.id,
        req.query.audience,
        resolveRequestBaseUrl(req),
      )
      return sendPdf(res, result)
    } catch (err) {
      next(err)
    }
  }
}

export default new SupplierDocumentController()
