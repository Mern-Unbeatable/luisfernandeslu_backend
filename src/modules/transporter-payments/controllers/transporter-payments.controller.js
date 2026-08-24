import transporterPaymentsService from '../services/transporter-payments.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'

export class TransporterPaymentsController {
  async get(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await transporterPaymentsService.get(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async withdraw(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await transporterPaymentsService.withdraw(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new TransporterPaymentsController()
