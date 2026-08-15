import promoCodeService from '../services/promo-code.service.js'
import { sendSuccess } from '../../../utils/apiResponse.js'

function sendResult(res, result) {
  const { message, ...data } = result.body || {}
  return sendSuccess(res, result.status, data, message)
}

export class PromoCodeController {
  async create(req, res, next) {
    try {
      return sendResult(res, await promoCodeService.create(req.auth, req.body))
    } catch (err) {
      next(err)
    }
  }

  async list(req, res, next) {
    try {
      return sendResult(res, await promoCodeService.list(req.auth, req.query))
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      return sendResult(
        res,
        await promoCodeService.getById(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async update(req, res, next) {
    try {
      return sendResult(
        res,
        await promoCodeService.update(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async setStatus(req, res, next) {
    try {
      return sendResult(
        res,
        await promoCodeService.setStatus(
          req.auth,
          req.params.id,
          req.body.isActive,
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async remove(req, res, next) {
    try {
      return sendResult(
        res,
        await promoCodeService.remove(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new PromoCodeController()
