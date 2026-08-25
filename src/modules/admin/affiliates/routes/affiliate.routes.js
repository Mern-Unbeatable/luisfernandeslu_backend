import { Router } from 'express'
import adminAffiliateController from '../controllers/affiliate.controller.js'
import adminAffiliateTierController from '../../affiliate-tiers/controllers/tier.controller.js'
import {
  adminAffiliateIdParamSchema,
  adminPayoutIdParamSchema,
  affiliateAnalyticsQuerySchema,
  listAdminAffiliatesQuerySchema,
  listAffiliateClientsQuerySchema,
  listAffiliateCommissionsQuerySchema,
  listAffiliatePayoutsQuerySchema,
  updateAdminAffiliateStatusBodySchema,
  updatePayoutStatusBodySchema,
} from '../validations/affiliate.validation.js'
import {
  createTierBodySchema,
  reorderTiersBodySchema,
  tierIdParamSchema,
  updateTierBodySchema,
} from '../../affiliate-tiers/validations/tier.validation.js'
import { validate } from '../../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../../middlewares/auth.middleware.js'

/** Mounted at `/api/admin/affiliates`. */
class AdminAffiliateRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('admin'))

    this.router.get('/stats', (req, res, next) =>
      adminAffiliateController.stats(req, res, next),
    )

    this.router.get(
      '/payouts',
      validate(listAffiliatePayoutsQuerySchema, 'query'),
      (req, res, next) =>
        adminAffiliateController.listPayoutRequests(req, res, next),
    )

    this.router.patch(
      '/payouts/:payoutId/status',
      validate(adminPayoutIdParamSchema, 'params'),
      validate(updatePayoutStatusBodySchema, 'body'),
      (req, res, next) =>
        adminAffiliateController.updatePayoutStatus(req, res, next),
    )

    this.router.get('/levels', (req, res, next) =>
      adminAffiliateTierController.list(req, res, next),
    )

    this.router.post(
      '/levels',
      validate(createTierBodySchema, 'body'),
      (req, res, next) => adminAffiliateTierController.create(req, res, next),
    )

    this.router.put(
      '/levels/reorder',
      validate(reorderTiersBodySchema, 'body'),
      (req, res, next) => adminAffiliateTierController.reorder(req, res, next),
    )

    this.router.patch(
      '/levels/:id',
      validate(tierIdParamSchema, 'params'),
      validate(updateTierBodySchema, 'body'),
      (req, res, next) => adminAffiliateTierController.update(req, res, next),
    )

    this.router.delete(
      '/levels/:id',
      validate(tierIdParamSchema, 'params'),
      (req, res, next) => adminAffiliateTierController.remove(req, res, next),
    )

    this.router.get(
      '/',
      validate(listAdminAffiliatesQuerySchema, 'query'),
      (req, res, next) => adminAffiliateController.list(req, res, next),
    )

    this.router.get(
      '/:id/clients',
      validate(adminAffiliateIdParamSchema, 'params'),
      validate(listAffiliateClientsQuerySchema, 'query'),
      (req, res, next) =>
        adminAffiliateController.listClients(req, res, next),
    )

    this.router.get(
      '/:id/analytics',
      validate(adminAffiliateIdParamSchema, 'params'),
      validate(affiliateAnalyticsQuerySchema, 'query'),
      (req, res, next) =>
        adminAffiliateController.analytics(req, res, next),
    )

    this.router.get(
      '/:id/commissions',
      validate(adminAffiliateIdParamSchema, 'params'),
      validate(listAffiliateCommissionsQuerySchema, 'query'),
      (req, res, next) =>
        adminAffiliateController.listCommissions(req, res, next),
    )

    this.router.get(
      '/:id/payouts',
      validate(adminAffiliateIdParamSchema, 'params'),
      validate(listAffiliatePayoutsQuerySchema, 'query'),
      (req, res, next) =>
        adminAffiliateController.listPayouts(req, res, next),
    )

    this.router.patch(
      '/:id/status',
      validate(adminAffiliateIdParamSchema, 'params'),
      validate(updateAdminAffiliateStatusBodySchema, 'body'),
      (req, res, next) =>
        adminAffiliateController.updateStatus(req, res, next),
    )

    this.router.delete(
      '/:id',
      validate(adminAffiliateIdParamSchema, 'params'),
      (req, res, next) => adminAffiliateController.remove(req, res, next),
    )

    this.router.get(
      '/:id',
      validate(adminAffiliateIdParamSchema, 'params'),
      (req, res, next) => adminAffiliateController.getById(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AdminAffiliateRoutes().getRoutes()
