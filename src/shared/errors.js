import { AppError } from '../utils/AppError.js'

export function httpError(message, status = 400, code = 'Error', details) {
  return new AppError(message, status, code, details)
}

export function unauthorized(message = 'Unauthorized') {
  return new AppError(message, 401, 'Unauthorized')
}

export function forbidden(message = 'Forbidden') {
  return new AppError(message, 403, 'Forbidden')
}

export function notFound(message = 'Not found', code = 'NotFound') {
  return new AppError(message, 404, code)
}

export function conflict(message, code = 'Conflict', details) {
  return new AppError(message, 409, code, details)
}

const DB_UNREACHABLE_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'P1001',
  'P1017',
])

function collectErrorCodes(err) {
  const codes = []
  let current = err
  for (let i = 0; i < 4 && current; i += 1) {
    if (current.code) codes.push(current.code)
    current = current.cause
  }
  return codes
}

/** Prisma 7 + pg adapter often wraps a refused DB socket in an empty findUnique message. */
export function mapDatabaseError(err) {
  if (!err) return null
  const codes = collectErrorCodes(err)
  if (!codes.some((code) => DB_UNREACHABLE_CODES.has(code))) return null
  return httpError(
    'Database is unreachable. Check DATABASE_URL and that Postgres is running.',
    503,
    'DatabaseUnavailable',
  )
}

export { AppError }
