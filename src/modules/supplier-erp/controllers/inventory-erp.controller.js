import inventoryService from '../../inventory/services/inventory.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'

export class InventoryErpController {
  async list(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await inventoryService.list(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await inventoryService.getById(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async create(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await inventoryService.create(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async restock(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await inventoryService.restock(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async remove(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await inventoryService.remove(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new InventoryErpController()

