import adminSupplierService from '../services/supplier.service.js'
import { sendServiceResult } from '../../../../utils/apiResponse.js'

class AdminSupplierController {
  async stats(req, res, next) {
    try {
      return sendServiceResult(res, await adminSupplierService.stats(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async list(req, res, next) {
    try {
      return sendServiceResult(res, await adminSupplierService.list(req.auth, req.query))
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminSupplierService.getById(req.auth, req.params.id, req),
      )
    } catch (err) {
      next(err)
    }
  }

  async approve(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminSupplierService.approve(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async reject(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminSupplierService.reject(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateStatus(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminSupplierService.updateStatus(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateCommission(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminSupplierService.updateCommission(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async remove(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminSupplierService.remove(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async liveThread(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await adminSupplierService.liveThread(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new AdminSupplierController()
