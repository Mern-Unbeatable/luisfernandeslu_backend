import companyProjectService from '../services/company-project.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'

class CompanyProjectController {
  async suggestions(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await companyProjectService.suggestions(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async locationSuggestions(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await companyProjectService.locationSuggestions(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async list(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await companyProjectService.list(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await companyProjectService.getById(
          req.auth,
          req.params.projectId,
          req.query,
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async getOrder(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await companyProjectService.getOrder(
          req.auth,
          req.params.projectId,
          req.params.orderId,
        ),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new CompanyProjectController()
