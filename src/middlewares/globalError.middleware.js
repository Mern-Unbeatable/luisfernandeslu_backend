import { ZodError } from 'zod'
import { AppError } from '../utils/AppError.js'
import { sendError } from '../utils/apiResponse.js'
import { isProduction, isDevelopment } from '../config/env.js'
import { mapDatabaseError } from '../shared/errors.js'

/**
 * Global error handler — register LAST in app.js:
 *   app.use(globalErrorHandler)
 */
export function globalErrorHandler(err, req, res, next) {
  // eslint-disable-next-line no-unused-vars
  void next

  if (res.headersSent) {
    return
  }

  console.error('[error]', err)

  if (err instanceof AppError) {
    return sendError(res, err.statusCode, err.message, {
      error: err.code || 'Error',
      ...(err.details != null ? { details: err.details } : {}),
    })
  }

  if (err instanceof ZodError) {
    return sendError(res, 400, 'Invalid request data', {
      error: 'ValidationError',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }

  const dbError = mapDatabaseError(err)
  if (dbError) {
    return sendError(res, dbError.statusCode, dbError.message, {
      error: dbError.code,
    })
  }

  // Multer / upload errors
  if (err?.name === 'MulterError' || err?.code === 'LIMIT_FILE_SIZE') {
    return sendError(res, 400, err.message || 'File upload error', {
      error: 'UploadError',
    })
  }

  // Errors thrown with .status / .statusCode (legacy service errors)
  const statusCode = err.statusCode || err.status || 500
  if (statusCode < 500 && err.message) {
    return sendError(res, statusCode, err.message, {
      error: err.code || err.name || 'Error',
    })
  }

  return sendError(
    res,
    500,
    isProduction
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error',
    {
      error: 'InternalServerError',
      ...(isDevelopment
        ? { details: [{ path: 'stack', message: err.stack }] }
        : {}),
    },
  )
}

export default globalErrorHandler
