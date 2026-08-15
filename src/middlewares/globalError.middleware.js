import { ZodError } from 'zod'
import { AppError } from '../utils/AppError.js'
import { sendError } from '../utils/apiResponse.js'

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
    process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error',
    {
      error: 'InternalServerError',
      ...(process.env.NODE_ENV === 'development'
        ? { details: [{ path: 'stack', message: err.stack }] }
        : {}),
    },
  )
}

export default globalErrorHandler
