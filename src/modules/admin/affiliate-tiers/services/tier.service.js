import prisma from '../../../../../lib/prisma.js'
import { httpError } from '../../../../shared/errors.js'

function assertAdmin(auth) {
  if (!auth?.id || String(auth.role).toLowerCase() !== 'admin') {
    throw httpError('Admin access required', 403, 'Forbidden')
  }
}

function mapTier(t) {
  return {
    id: t.id,
    name: t.name,
    minActiveClients: t.minActiveClients,
    commissionPercent: t.commissionPercent,
    sortOrder: t.sortOrder,
    isActive: t.isActive,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }
}

class AdminAffiliateTierService {
  async list(auth) {
    assertAdmin(auth)
    const tiers = await prisma.affiliateTier.findMany({
      orderBy: [{ sortOrder: 'asc' }, { minActiveClients: 'asc' }],
    })
    return {
      status: 200,
      body: { tiers: tiers.map(mapTier), message: 'Affiliate tiers fetched' },
    }
  }

  async create(auth, body = {}) {
    assertAdmin(auth)
    const name = String(body.name || '').trim()
    const minActiveClients = Number(body.minActiveClients)
    const commissionPercent = Number(body.commissionPercent)
    const sortOrder = Number(body.sortOrder ?? minActiveClients)

    if (!name) throw httpError('name is required', 400, 'ValidationError')
    if (!Number.isFinite(minActiveClients) || minActiveClients < 0) {
      throw httpError('minActiveClients must be >= 0', 400, 'ValidationError')
    }
    if (!Number.isFinite(commissionPercent) || commissionPercent < 0) {
      throw httpError('commissionPercent must be >= 0', 400, 'ValidationError')
    }

    try {
      const tier = await prisma.affiliateTier.create({
        data: {
          name,
          minActiveClients,
          commissionPercent,
          sortOrder,
          isActive: body.isActive !== false,
        },
      })
      return {
        status: 201,
        body: { tier: mapTier(tier), message: 'Affiliate tier created' },
      }
    } catch (err) {
      if (err?.code === 'P2002') {
        throw httpError(
          'A tier with this minActiveClients already exists',
          409,
          'Conflict',
        )
      }
      throw err
    }
  }

  async update(auth, id, body = {}) {
    assertAdmin(auth)
    const existing = await prisma.affiliateTier.findUnique({ where: { id } })
    if (!existing) throw httpError('Tier not found', 404, 'NotFound')

    const data = {}
    if (body.name != null) data.name = String(body.name).trim()
    if (body.minActiveClients != null) {
      data.minActiveClients = Number(body.minActiveClients)
      if (!Number.isFinite(data.minActiveClients) || data.minActiveClients < 0) {
        throw httpError('minActiveClients must be >= 0', 400, 'ValidationError')
      }
    }
    if (body.commissionPercent != null) {
      data.commissionPercent = Number(body.commissionPercent)
      if (!Number.isFinite(data.commissionPercent) || data.commissionPercent < 0) {
        throw httpError('commissionPercent must be >= 0', 400, 'ValidationError')
      }
    }
    if (body.sortOrder != null) data.sortOrder = Number(body.sortOrder)
    if (body.isActive != null) data.isActive = Boolean(body.isActive)

    try {
      const tier = await prisma.affiliateTier.update({ where: { id }, data })
      return {
        status: 200,
        body: { tier: mapTier(tier), message: 'Affiliate tier updated' },
      }
    } catch (err) {
      if (err?.code === 'P2002') {
        throw httpError(
          'A tier with this minActiveClients already exists',
          409,
          'Conflict',
        )
      }
      throw err
    }
  }

  async remove(auth, id) {
    assertAdmin(auth)
    const existing = await prisma.affiliateTier.findUnique({ where: { id } })
    if (!existing) throw httpError('Tier not found', 404, 'NotFound')
    await prisma.affiliateTier.delete({ where: { id } })
    return {
      status: 200,
      body: { id, message: 'Affiliate tier deleted' },
    }
  }
}

export default new AdminAffiliateTierService()
