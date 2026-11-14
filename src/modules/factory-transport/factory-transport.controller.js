import factoryTransportService from './factory-transport.service.js'
import { sendServiceResult } from '../../utils/apiResponse.js'

export class FactoryTransportController {
  async chooseTransport(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await factoryTransportService.chooseTransport(req.auth, req.params.orderId, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async markDelivered(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await factoryTransportService.markDelivered(req.auth, req.params.orderId),
      )
    } catch (err) {
      next(err)
    }
  }

  async listForSupplier(req, res, next) {
    try {
      return sendServiceResult(res, await factoryTransportService.listForSupplier(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async payForSupplier(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await factoryTransportService.payForSupplier(req.auth, req.params.orderId, req.body),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new FactoryTransportController()
