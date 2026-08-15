/**
 * Standard API success/error JSON (includes statusCode in body).
 */

export function sendSuccess(res, statusCode, data = {}, message) {
  const body = {
    success: true,
    statusCode,
    ...(message ? { message } : {}),
    ...data,
  }
  return res.status(statusCode).json(body)
}

export function sendError(
  res,
  statusCode,
  message,
  { error = 'Error', details } = {},
) {
  const body = {
    success: false,
    statusCode,
    error,
    message,
    ...(details ? { details } : {}),
  }
  return res.status(statusCode).json(body)
}

export default { sendSuccess, sendError }
