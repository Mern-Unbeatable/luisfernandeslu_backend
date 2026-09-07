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

/** Prisma 7 + pg adapter error mappings. */
export function mapDatabaseError(err) {
  if (!err) return null
  const codes = collectErrorCodes(err)
  if (codes.some((code) => DB_UNREACHABLE_CODES.has(code))) {
    return httpError(
      'Database is unreachable. Check DATABASE_URL and that Postgres is running.',
      503,
      'DatabaseUnavailable',
    )
  }

  const msg = String(err.message || '')
  if (
    codes.includes('P2003') ||
    codes.includes('23001') ||
    codes.includes('23503') ||
    msg.includes('foreign key constraint') ||
    msg.includes('violates RESTRICT setting')
  ) {
    return httpError(
      'This record cannot be deleted because it is linked to existing orders, transactions, or history in the system. Please suspend or deactivate it instead.',
      409,
      'HasRelatedRecords',
    )
  }

  return null
}

export { AppError }
