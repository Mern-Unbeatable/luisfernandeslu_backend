import transporterOverviewService from '../services/transporter-overview.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'

class TransporterOverviewController {
  async get(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await transporterOverviewService.get(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new TransporterOverviewController()
