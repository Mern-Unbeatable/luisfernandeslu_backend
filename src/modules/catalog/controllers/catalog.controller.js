import catalogService from '../services/catalog.service.js'
import { sendSuccess } from '../../../utils/apiResponse.js'

function sendResult(res, result) {
  const { message, ...data } = result.body || {}
  return sendSuccess(res, result.status, data, message)
}

export class CatalogController {
  async getCategories(req, res, next) {
    try {
      const result = await catalogService.getCategories()
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async getSubCategories(req, res, next) {
    try {
      const result = await catalogService.getSubCategories(
        req.params.categoryId,
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async getProductTypes(req, res, next) {
    try {
      const result = await catalogService.getProductTypes(
        req.params.subCategoryId,
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }
}

export default new CatalogController()
