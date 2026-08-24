import insuranceService from '../services/insurance.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

function sendPdf(res, result) {
  const { buffer, filename, contentType } = result.file
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Content-Length', buffer.length)
  return res.status(200).send(buffer)
}

export class TransporterInsuranceController {
  async list(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await insuranceService.list(req.auth, resolveRequestBaseUrl(req)),
      )
    } catch (err) {
      next(err)
    }
  }

  async upload(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await insuranceService.upload(
          req.auth,
          req.body,
          req.files,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async renew(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await insuranceService.renew(
          req.auth,
          req.params.kind,
          req.body,
          req.files,
          resolveRequestBaseUrl(req),
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async downloadPdf(req, res, next) {
    try {
      return sendPdf(
        res,
        await insuranceService.downloadPdf(req.auth, req.params.kind),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new TransporterInsuranceController()
