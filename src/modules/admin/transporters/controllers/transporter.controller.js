import adminTransporterService from '../services/transporter.service.js'
import { sendServiceResult } from '../../../../utils/apiResponse.js'

class AdminTransporterController {
  async stats(req, res, next) {
    try {
      return sendServiceResult(res, await adminTransporterService.stats(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async list(req, res, next) {
    try {
      return sendServiceResult(res, await adminTransporterService.list(req.auth, req.query))
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminTransporterService.getById(req.auth, req.params.id, req),
      )
    } catch (err) {
      next(err)
    }
  }

  async approve(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminTransporterService.approve(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async reject(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminTransporterService.reject(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async verifyInsurance(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminTransporterService.verifyInsurance(
          req.auth,
          req.params.id,
          req.params.kind,
          req,
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async rejectInsurance(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminTransporterService.rejectInsurance(
          req.auth,
          req.params.id,
          req.params.kind,
          req.body,
          req,
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateStatus(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminTransporterService.updateStatus(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateCommission(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminTransporterService.updateCommission(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async remove(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminTransporterService.remove(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new AdminTransporterController()
