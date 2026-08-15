import { Router } from 'express'
import productService from '../../products/services/product.service.js'
import promotionController from '../../promotions/controllers/promotion.controller.js'
import {
  adminListProductsQuerySchema,
  adminRejectBodySchema,
} from '../../products/validations/product-list.validation.js'
import { productIdParamSchema } from '../../products/validations/product.validation.js'
import {
  adminPromotionListQuerySchema,
  adminRejectPromotionBodySchema,
  planIdParamSchema,
  promotionIdParamSchema,
  updatePlanBodySchema,
  upsertPlanBodySchema,
} from '../../promotions/validations/promotion.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'
import { sendSuccess } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

function sendResult(res, result) {
  const { message, ...data } = result.body || {}
  return sendSuccess(res, result.status, data, message)
}

class AdminRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('admin'))

    // Product moderation
    this.router.get(
      '/products',
      validate(adminListProductsQuerySchema, 'query'),
      async (req, res, next) => {
        try {
          const result = await productService.adminList(
            req.query,
            resolveRequestBaseUrl(req),
          )
          return sendResult(res, result)
        } catch (err) {
          next(err)
        }
      },
    )

    this.router.post(
      '/products/:id/approve',
      validate(productIdParamSchema, 'params'),
      async (req, res, next) => {
        try {
          return sendResult(
            res,
            await productService.approveListing(req.params.id),
          )
        } catch (err) {
          next(err)
        }
      },
    )

    this.router.post(
      '/products/:id/reject',
      validate(productIdParamSchema, 'params'),
      validate(adminRejectBodySchema, 'body'),
      async (req, res, next) => {
        try {
          return sendResult(
            res,
            await productService.rejectListing(
              req.params.id,
              req.body.reason,
            ),
          )
        } catch (err) {
          next(err)
        }
      },
    )

    // Promotion plans (Sponsored Product pricing)
    this.router.get('/promotion-plans', (req, res, next) =>
      promotionController.adminListPlans(req, res, next),
    )

    this.router.post(
      '/promotion-plans',
      validate(upsertPlanBodySchema, 'body'),
      (req, res, next) => promotionController.upsertPlan(req, res, next),
    )

    this.router.patch(
      '/promotion-plans/:id',
      validate(planIdParamSchema, 'params'),
      validate(updatePlanBodySchema, 'body'),
      (req, res, next) => promotionController.updatePlan(req, res, next),
    )

    // Promotion moderation
    this.router.get(
      '/promotions',
      validate(adminPromotionListQuerySchema, 'query'),
      (req, res, next) => promotionController.adminList(req, res, next),
    )

    this.router.post(
      '/promotions/:id/approve',
      validate(promotionIdParamSchema, 'params'),
      (req, res, next) => promotionController.approve(req, res, next),
    )

    this.router.post(
      '/promotions/:id/reject',
      validate(promotionIdParamSchema, 'params'),
      validate(adminRejectPromotionBodySchema, 'body'),
      (req, res, next) => promotionController.reject(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AdminRoutes().getRoutes()
