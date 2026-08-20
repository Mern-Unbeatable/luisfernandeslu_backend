import { Router } from 'express'
import promotionController from '../controllers/promotion.controller.js'
import {
  adminPromotionListQuerySchema,
  adminModeratePromotionBodySchema,
  planIdParamSchema,
  promotionIdParamSchema,
  updatePlanBodySchema,
  upsertPlanBodySchema,
} from '../validations/promotion.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

/** Mounted at `/api/admin`. */
class PromotionAdminRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('admin'))

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

    this.router.get(
      '/promotions',
      validate(adminPromotionListQuerySchema, 'query'),
      (req, res, next) => promotionController.adminList(req, res, next),
    )

    this.router.patch(
      '/promotions/:id',
      validate(promotionIdParamSchema, 'params'),
      validate(adminModeratePromotionBodySchema, 'body'),
      (req, res, next) => promotionController.adminModerate(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new PromotionAdminRoutes().getRoutes()
