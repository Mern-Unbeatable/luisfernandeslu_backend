import { Router } from 'express'
import assistantController from '../controllers/assistant.controller.js'
import { assistantChatSchema } from '../validations/assistant.validation.js'
import { validate } from '../../../middlewares/validate.middleware.js'
import { optionalAccessToken } from '../../../middlewares/auth.middleware.js'

class AssistantRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.use(optionalAccessToken)

    this.router.get(
      '/history',
      (req, res, next) => assistantController.getHistory(req, res, next),
    )

    this.router.post(
      '/chat',
      validate(assistantChatSchema, 'body'),
      (req, res, next) => assistantController.chat(req, res, next),
    )
  }


  getRoutes() {
    return this.router
  }
}

export default new AssistantRoutes().getRoutes()
