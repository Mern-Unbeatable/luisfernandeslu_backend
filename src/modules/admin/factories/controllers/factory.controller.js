import adminFactoryService from '../services/factory.service.js'
import { sendServiceResult } from '../../../../utils/apiResponse.js'

class AdminFactoryController {
  async stats(req, res, next) {
    try {
      return sendServiceResult(res, await adminFactoryService.stats(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async list(req, res, next) {
    try {
      return sendServiceResult(res, await adminFactoryService.list(req.auth, req.query))
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminFactoryService.getById(req.auth, req.params.id, req),
      )
    } catch (err) {
      next(err)
    }
  }

  async approve(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminFactoryService.approve(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async reject(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminFactoryService.reject(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateStatus(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminFactoryService.updateStatus(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateCommission(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminFactoryService.updateCommission(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async remove(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminFactoryService.remove(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new AdminFactoryController()
