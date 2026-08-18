import crypto from 'node:crypto'
import prisma from '../../lib/prisma.js'
import { httpError } from '../shared/errors.js'

function extractApiKey(req) {
  const headerKey =
    req.headers['x-erp-api-key'] ||
    req.headers['x-api-key'] ||
    req.headers['x-erp-apikey']

  if (headerKey) return String(headerKey).trim()

  const auth = req.headers.authorization
  if (!auth) return null

  const v = String(auth).trim()
  const [scheme, token] = v.split(' ')
  if (!scheme || !token) return null

  const s = scheme.toLowerCase()
  if (s === 'apikey' || s === 'api-key') return token.trim()
  return null
}

function hashKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex')
}

/**
 * Require a Supplier ERP API key.
 *
 * Sets:
 *   req.auth = { id: supplierId, role: 'supplier' }
 */
export function requireSupplierErpApiKey(req, res, next) {
  const key = extractApiKey(req)
  if (!key) {
    return next(
      httpError('ERP API key required', 401, 'Unauthorized'),
    )
  }

  req._erpApiKey = key
  return next()
}

export async function requireSupplierErpApiKeyResolved(req, res, next) {
  try {
    const key = req._erpApiKey
    if (!key) {
      throw httpError('ERP API key required', 401, 'Unauthorized')
    }

    const keyHash = hashKey(key)
    const apiKey = await prisma.supplierErpApiKey.findUnique({
      where: { keyHash },
    })

    if (!apiKey || apiKey.revokedAt) {
      throw httpError('Invalid ERP API key', 401, 'Unauthorized')
    }

    if (apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() < Date.now()) {
      throw httpError('ERP API key expired', 401, 'Unauthorized')
    }

    await prisma.supplierErpApiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
      select: { id: true },
    })

    req.auth = {
      id: apiKey.supplierId,
      role: 'supplier',
    }

    return next()
  } catch (err) {
    return next(err)
  }
}

export function requireSupplierErpApiKeyAll(req, res, next) {
  requireSupplierErpApiKey(req, res, () => requireSupplierErpApiKeyResolved(req, res, next))
}

