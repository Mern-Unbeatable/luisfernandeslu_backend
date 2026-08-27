import { Router } from 'express'
import companyProjectController from '../controllers/company-project.controller.js'
import {
  listProjectsQuerySchema,
  projectIdParamSchema,
  projectOrderParamsSchema,
  projectOrdersQuerySchema,
  projectSuggestionsQuerySchema,
} from '../validations/company-project.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import {
  requireAccessToken,
  requireRoles,
} from '../../../middlewares/auth.middleware.js'

/** Mounted at `/api/company/projects`. */
class CompanyProjectRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(requireAccessToken, requireRoles('company'))

    this.router.get(
      '/suggestions',
      validate(projectSuggestionsQuerySchema, 'query'),
      (req, res, next) => companyProjectController.suggestions(req, res, next),
    )

    this.router.get(
      '/location-suggestions',
      validate(projectSuggestionsQuerySchema, 'query'),
      (req, res, next) =>
        companyProjectController.locationSuggestions(req, res, next),
    )

    this.router.get(
      '/',
      validate(listProjectsQuerySchema, 'query'),
      (req, res, next) => companyProjectController.list(req, res, next),
    )

    this.router.get(
      '/:projectId/orders/:orderId',
      validate(projectOrderParamsSchema, 'params'),
      (req, res, next) => companyProjectController.getOrder(req, res, next),
    )

    this.router.get(
      '/:projectId',
      validate(projectIdParamSchema, 'params'),
      validate(projectOrdersQuerySchema, 'query'),
      (req, res, next) => companyProjectController.getById(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new CompanyProjectRoutes().getRoutes()
