import adminUserService from '../services/user.service.js'
import { sendServiceResult } from '../../../../utils/apiResponse.js'

class AdminUserController {
  async stats(req, res, next) {
    try {
      return sendServiceResult(res, await adminUserService.stats(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async list(req, res, next) {
    try {
      return sendServiceResult(res, await adminUserService.list(req.auth, req.query))
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminUserService.getById(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateStatus(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminUserService.updateStatus(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async remove(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminUserService.remove(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async listMessages(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminUserService.listMessages(req.auth, req.params.id, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async sendMessage(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminUserService.sendMessage(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new AdminUserController()
