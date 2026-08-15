import { ZodError } from 'zod'
import { sendError } from '../utils/apiResponse.js'

/**
 * Validate req.body / params / query with a Zod schema.
 * Shared — use from any module route.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source])
      req[source] = parsed
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        return sendError(res, 400, 'Invalid request data', {
          error: 'ValidationError',
          details: err.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        })
      }
      next(err)
    }
  }
}

/**
 * Validate register body using the schema for :role.
 */
export function validateRegisterBody(schemasByRole) {
  return (req, res, next) => {
    try {
      const role = String(req.params.role || '').toLowerCase()
      const schema = schemasByRole[role]
      if (!schema) {
        return sendError(res, 400, `No validation schema for role: ${role}`, {
          error: 'ValidationError',
        })
      }
      req.body = schema.parse(req.body || {})
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        return sendError(res, 400, 'Invalid request data', {
          error: 'ValidationError',
          details: err.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        })
      }
      next(err)
    }
  }
}

export default { validate, validateRegisterBody }
