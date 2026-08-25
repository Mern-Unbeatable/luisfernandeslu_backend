import adminAffiliateTierService from '../services/tier.service.js'
import { sendServiceResult } from '../../../../utils/apiResponse.js'

class AdminAffiliateTierController {
  async list(req, res, next) {
    try {
      return sendServiceResult(res, await adminAffiliateTierService.list(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async create(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminAffiliateTierService.create(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async update(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminAffiliateTierService.update(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async remove(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminAffiliateTierService.remove(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async reorder(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminAffiliateTierService.reorder(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new AdminAffiliateTierController()
