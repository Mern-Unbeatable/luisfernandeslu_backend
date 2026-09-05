import assistantService from '../services/assistant.service.js'
import { sendSuccess } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

export class AssistantController {
  async getHistory(req, res, next) {
    try {
      const userId = req.auth?.id
      const messages = await assistantService.getChatHistory(userId)
      return sendSuccess(res, 200, { messages }, 'Assistant chat history fetched')
    } catch (err) {
      next(err)
    }
  }

  async chat(req, res, next) {
    try {
      const { message, history } = req.body
      const baseUrl = resolveRequestBaseUrl(req)
      const result = await assistantService.processChat(message, history, baseUrl, req.auth)
      return sendSuccess(res, 200, result, 'Assistant response generated')
    } catch (err) {
      next(err)
    }
  }
}

export default new AssistantController()

