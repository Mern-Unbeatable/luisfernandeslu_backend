import addressService from '../services/address.service.js'
import { sendSuccess } from '../../../utils/apiResponse.js'

function sendResult(res, result) {
  const { message, ...data } = result.body || {}
  return sendSuccess(res, result.status, data, message)
}

export class AddressController {
  async list(req, res, next) {
    try {
      return sendResult(res, await addressService.list(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async create(req, res, next) {
    try {
      return sendResult(res, await addressService.create(req.auth, req.body))
    } catch (err) {
      next(err)
    }
  }

  async update(req, res, next) {
    try {
      return sendResult(
        res,
        await addressService.update(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async remove(req, res, next) {
    try {
      return sendResult(res, await addressService.remove(req.auth, req.params.id))
    } catch (err) {
      next(err)
    }
  }
}

export default new AddressController()
