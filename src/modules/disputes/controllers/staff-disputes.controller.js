import staffDisputesService from '../services/staff-disputes.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'

export class StaffDisputesController {
  async list(req, res, next) {
    try {
      return sendServiceResult(res, await staffDisputesService.list())
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await staffDisputesService.getById(req.params.disputeId),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateStatus(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await staffDisputesService.updateStatus(
          req.params.disputeId,
          req.body.status,
        ),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new StaffDisputesController()
