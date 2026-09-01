import { Router } from 'express'
import {
  requireAccessTokenWithUser,
} from '../../../middlewares/auth.middleware.js'
import ChatController from '../controllers/chat.controller.js'

const router = Router()

// All chat routes require authentication
router.use(requireAccessTokenWithUser)

router.get('/threads', ChatController.listThreads)
router.get('/threads/:threadId/messages', ChatController.listMessages)

export default router
