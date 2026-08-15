export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'Error', details = undefined) {
    super(message)
    this.statusCode = statusCode
    this.status = statusCode
    this.code = code
    this.details = details
    this.isOperational = true
    Error.captureStackTrace?.(this, this.constructor)
  }
}

export default AppError
