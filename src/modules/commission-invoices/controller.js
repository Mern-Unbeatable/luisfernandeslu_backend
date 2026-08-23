import commissionInvoiceService from './service.js'
import { sendServiceResult } from '../../utils/apiResponse.js'

function sendPdf(res, result) {
  const { buffer, filename, contentType } = result.file
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Content-Length', buffer.length)
  return res.status(200).send(buffer)
}

export class CommissionInvoiceController {
  async list(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await commissionInvoiceService.list(req.auth.id, req.auth.role, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await commissionInvoiceService.getById(
          req.auth.id,
          req.auth.role,
          req.params.invoiceId,
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
        await commissionInvoiceService.downloadPdf(
          req.auth.id,
          req.auth.role,
          req.params.invoiceId,
        ),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new CommissionInvoiceController()
