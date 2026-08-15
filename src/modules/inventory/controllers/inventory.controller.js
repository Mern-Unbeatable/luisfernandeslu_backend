import inventoryService from '../services/inventory.service.js'
import { sendSuccess } from '../../../utils/apiResponse.js'

function sendResult(res, result) {
  const { message, ...data } = result.body || {}
  return sendSuccess(res, result.status, data, message)
}

export class InventoryController {
  async create(req, res, next) {
    try {
      const result = await inventoryService.create(req.auth, req.body)
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async list(req, res, next) {
    try {
      const result = await inventoryService.list(req.auth, req.query)
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async stats(req, res, next) {
    try {
      const result = await inventoryService.getStats(req.auth)
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async restock(req, res, next) {
    try {
      const result = await inventoryService.restock(
        req.auth,
        req.params.id,
        req.body,
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async remove(req, res, next) {
    try {
      const result = await inventoryService.remove(req.auth, req.params.id)
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }
}

export default new InventoryController()
