import { Router } from 'express'
import transportPaymentService from './transport-payment.service.js'
import { requireAccessToken, requireRoles } from '../../../middlewares/auth.middleware.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'

/** Mounted at `/api/admin/transport-payments`: factory-order transport paid by suppliers. */
const adminTransportPaymentRoutes = Router()
adminTransportPaymentRoutes.use(requireAccessToken, requireRoles('admin'))

adminTransportPaymentRoutes.get('/', async (req, res, next) => {
  try {
    return sendServiceResult(res, await transportPaymentService.list(req.query))
  } catch (err) {
    next(err)
  }
})

export default adminTransportPaymentRoutes
