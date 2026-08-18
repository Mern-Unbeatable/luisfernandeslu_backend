import crypto from 'node:crypto'
import prisma from '../../../../lib/prisma.js'
import { httpError } from '../../../shared/errors.js'

function generateApiKey() {
  // Base64URL: no `+` `/` so it works nicely in headers.
  return `erp_${crypto.randomBytes(32).toString('base64url')}`
}

function hashKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex')
}

class ApiKeyService {
  async assertSupplier(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    if (auth.role !== 'supplier') {
      throw httpError('Only suppliers can manage API keys', 403, 'Forbidden')
    }
  }

  async create(auth, body) {
    await this.assertSupplier(auth)

    const apiKey = generateApiKey()
    const keyHash = hashKey(apiKey)
    const row = await prisma.$transaction(async (tx) => {
      // Single-active-key policy: revoke any currently active key first.
      await tx.supplierErpApiKey.updateMany({
        where: { supplierId: auth.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })

      return tx.supplierErpApiKey.create({
        data: {
          supplierId: auth.id,
          name: body.name,
          apiKey,
          permissions: body.permissions || null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          keyHash,
        },
        select: {
          id: true,
          name: true,
          apiKey: true,
          permissions: true,
          createdAt: true,
          revokedAt: true,
          lastUsedAt: true,
          expiresAt: true,
        },
      })
    })

    return {
      status: 201,
      body: {
        apiKeyId: row.id,
        apiKey,
        apiKeyMeta: row,
        message: 'ERP API key created',
      },
    }
  }

  async list(auth) {
    await this.assertSupplier(auth)

    const row = await prisma.supplierErpApiKey.findFirst({
      where: { supplierId: auth.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        apiKey: true,
        permissions: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
        expiresAt: true,
      },
    })

    return {
      status: 200,
      body: { apiKey: row, message: 'ERP API key fetched' },
    }
  }

  async revoke(auth, apiKeyId) {
    await this.assertSupplier(auth)

    const updated = await prisma.supplierErpApiKey.updateMany({
      where: { id: apiKeyId, supplierId: auth.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    if (updated.count === 0) {
      throw httpError('API key not found', 404, 'NotFound')
    }

    return {
      status: 200,
      body: { message: 'ERP API key revoked' },
    }
  }
}

export default new ApiKeyService()

