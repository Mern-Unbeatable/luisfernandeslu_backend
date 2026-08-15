import { sendError } from '../utils/apiResponse.js'

/** 404 — must be registered after all routes */
export function notFoundHandler(req, res) {
  return sendError(
    res,
    404,
    `The requested resource does not exist: ${req.method} ${req.originalUrl}`,
    { error: 'NotFound' },
  )
}

export default notFoundHandler
