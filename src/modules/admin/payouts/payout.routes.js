import { Router } from 'express'
import { z } from 'zod'
import payoutService from './payout.service.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import { requireAccessToken, requireRoles } from '../../../middlewares/auth.middleware.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'

const idParamSchema = z.object({ id: z.string().uuid() })
const statusBodySchema = z.object({ status: z.enum(['approved', 'paid', 'rejected']) })

/** Mounted at `/api/admin/payouts`: supplier and transporter withdrawal requests. */
const adminPayoutRoutes = Router()
adminPayoutRoutes.use(requireAccessToken, requireRoles('admin'))

adminPayoutRoutes.get('/', async (req, res, next) => {
  try {
    return sendServiceResult(res, await payoutService.list(req.query))
  } catch (err) {
    next(err)
  }
})

adminPayoutRoutes.patch(
  '/:id/status',
  validate(idParamSchema, 'params'),
  validate(statusBodySchema),
  async (req, res, next) => {
    try {
      return sendServiceResult(res, await payoutService.updateStatus(req.params.id, req.body))
    } catch (err) {
      next(err)
    }
  },
)

export default adminPayoutRoutes
