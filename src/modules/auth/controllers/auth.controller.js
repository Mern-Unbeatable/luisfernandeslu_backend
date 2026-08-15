import authService from '../services/auth.service.js'
import { normalizeMulterFiles } from '../upload.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'
import { sendSuccess } from '../../../utils/apiResponse.js'

function sendServiceResult(res, result) {
  for (const cookie of result.cookies || []) {
    res.append('Set-Cookie', cookie)
  }
  const { message, ...data } = result.body || {}
  return sendSuccess(res, result.status, data, message)
}

export class AuthController {
  async registerByRole(req, res, next) {
    try {
      const result = await authService.registerByRole({
        roleParam: req.params.role,
        body: req.body,
        files: normalizeMulterFiles(req.files),
        headers: req.headers,
        baseUrl: resolveRequestBaseUrl(req),
      })
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async loginByRole(req, res, next) {
    try {
      const result = await authService.loginByRole({
        roleParam: req.params.role,
        body: req.body,
        headers: req.headers,
        baseUrl: resolveRequestBaseUrl(req),
      })
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async verifyEmailOtp(req, res, next) {
    try {
      const result = await authService.verifyEmailOtp(req.body)
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async resendEmailOtp(req, res, next) {
    try {
      const result = await authService.resendEmailOtp(req.body)
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async forgotPassword(req, res, next) {
    try {
      const result = await authService.forgotPassword(req.body)
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async verifyResetOtp(req, res, next) {
    try {
      const result = await authService.verifyResetOtp(req.body)
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async resetPassword(req, res, next) {
    try {
      const result = await authService.resetPassword(req.body)
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async logout(req, res, next) {
    try {
      const result = await authService.logout(req.headers)
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async getMe(req, res, next) {
    try {
      const data = await authService.getMe(
        req.headers,
        resolveRequestBaseUrl(req),
      )
      return sendSuccess(res, 200, data, 'OK')
    } catch (err) {
      next(err)
    }
  }
}

export default new AuthController()
