import factoryOrderService from '../services/factory-order.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'

export class FactoryOrderController {
  async listForSupplier(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await factoryOrderService.listForSupplier(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async listForFactory(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await factoryOrderService.listForFactory(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async listFactories(req, res, next) {
    try {
      return sendServiceResult(res, await factoryOrderService.listFactories(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async listCompanies(req, res, next) {
    try {
      return sendServiceResult(res, await factoryOrderService.listCompanies(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async getByIdForSupplier(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await factoryOrderService.getByIdForSupplier(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async getByIdForFactory(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await factoryOrderService.getByIdForFactory(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async deleteForSupplier(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await factoryOrderService.deleteForSupplier(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async updateStatusForFactory(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await factoryOrderService.updateStatusForFactory(
          req.auth,
          req.params.id,
          req.body,
        ),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new FactoryOrderController()
