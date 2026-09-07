import adminDashboardService from '../services/dashboard.service.js'
import { sendSuccess } from '../../../../utils/apiResponse.js'

class AdminDashboardController {
  async getOverview(req, res, next) {
    try {
      const data = await adminDashboardService.getOverview(req.auth, req.query)
      return sendSuccess(res, 200, data, 'Admin dashboard overview loaded successfully')
    } catch (err) {
      next(err)
    }
  }
}

export default new AdminDashboardController()
