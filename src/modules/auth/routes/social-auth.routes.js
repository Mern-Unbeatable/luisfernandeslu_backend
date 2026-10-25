import { Router } from 'express'
import socialAuthService from '../services/social-auth.service.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'
import { sendSuccess } from '../../../utils/apiResponse.js'

const router = Router()

router.get('/google', async (req, res, next) => {
  try {
    const { redirectTo, cookies } = await socialAuthService.startGoogle(
      req.query,
      req.headers,
    )
    for (const cookie of cookies) res.append('Set-Cookie', cookie)
    return res.redirect(302, redirectTo)
  } catch (err) {
    next(err)
  }
})

router.get('/google/complete', async (req, res, next) => {
  try {
    const redirectTo = await socialAuthService.completeGoogle(req.query, req.headers)
    return res.redirect(302, redirectTo)
  } catch (err) {
    next(err)
  }
})

router.post('/google/exchange', async (req, res, next) => {
  try {
    const result = await socialAuthService.exchangeCode(
      req.body,
      resolveRequestBaseUrl(req),
    )
    const { message, ...data } = result.body
    return sendSuccess(res, result.status, data, message)
  } catch (err) {
    next(err)
  }
})

export default router
