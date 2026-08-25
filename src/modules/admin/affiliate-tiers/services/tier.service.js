import prisma from '../../../../../lib/prisma.js'
import { httpError } from '../../../../shared/errors.js'

function assertAdmin(auth) {
  if (!auth?.id || String(auth.role).toLowerCase() !== 'admin') {
    throw httpError('Admin access required', 403, 'Forbidden')
  }
}

function requirementLabel(minActiveClients) {
  const n = Number(minActiveClients) || 0
  if (n <= 0) return 'ENTRY LEVEL TIER'
  return `${n}+ Active Clients Required`
}

function mapTier(t) {
  const membersRequired = t.minActiveClients
  return {
    id: t.id,
    name: t.name,
    membersRequired,
    commissionPercent: t.commissionPercent,
    description: t.description || 'Recurring Lifetime payout split',
    requirement: requirementLabel(membersRequired),
    isActive: t.isActive,
    sortOrder: t.sortOrder,
  }
}

function resolveName(body) {
  return String(body.name || body.levelName || '').trim()
}

function resolveMembersRequired(body, fallback) {
  if (body.membersRequired != null) return Number(body.membersRequired)
  if (body.minActiveClients != null) return Number(body.minActiveClients)
  return fallback
}

class AdminAffiliateTierService {
  async list(auth) {
    assertAdmin(auth)
    const tiers = await prisma.affiliateTier.findMany({
      orderBy: [{ sortOrder: 'asc' }, { minActiveClients: 'asc' }],
    })
    const levels = tiers.map(mapTier)
    return {
      status: 200,
      body: {
        levels,
        tiers: levels,
        message: 'Levels fetched',
      },
    }
  }

  async create(auth, body = {}) {
    assertAdmin(auth)
    const name = resolveName(body)
    const minActiveClients = resolveMembersRequired(body)
    const commissionPercent = Number(body.commissionPercent)
    const description =
      body.description != null
        ? String(body.description).trim()
        : 'Recurring Lifetime payout split'
    const sortOrder =
      body.sortOrder != null ? Number(body.sortOrder) : undefined

    if (!name) throw httpError('name is required', 400, 'ValidationError')
    if (!Number.isFinite(minActiveClients) || minActiveClients < 0) {
      throw httpError('minActiveClients must be >= 0', 400, 'ValidationError')
    }
    if (!Number.isFinite(commissionPercent) || commissionPercent < 0) {
      throw httpError('commissionPercent must be >= 0', 400, 'ValidationError')
    }

    const last = await prisma.affiliateTier.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    try {
      const tier = await prisma.affiliateTier.create({
        data: {
          name,
          minActiveClients,
          commissionPercent,
          description: description || 'Recurring Lifetime payout split',
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : (last?.sortOrder ?? -1) + 1,
          isActive: body.isActive === true,
        },
      })
      return {
        status: 201,
        body: { level: mapTier(tier), message: 'Level created' },
      }
    } catch (err) {
      if (err?.code === 'P2002') {
        throw httpError(
          'A level with this membersRequired already exists',
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
    const name = resolveName(body)
    if (name) data.name = name
    if (body.minActiveClients != null || body.membersRequired != null) {
      data.minActiveClients = resolveMembersRequired(body)
      if (!Number.isFinite(data.minActiveClients) || data.minActiveClients < 0) {
        throw httpError('membersRequired must be >= 0', 400, 'ValidationError')
      }
    }
    if (body.commissionPercent != null) {
      data.commissionPercent = Number(body.commissionPercent)
      if (!Number.isFinite(data.commissionPercent) || data.commissionPercent < 0) {
        throw httpError('commissionPercent must be >= 0', 400, 'ValidationError')
      }
    }
    if (body.description !== undefined) {
      data.description = body.description == null ? null : String(body.description).trim()
    }
    if (body.sortOrder != null) data.sortOrder = Number(body.sortOrder)
    if (body.isActive != null) data.isActive = Boolean(body.isActive)

    try {
      const tier = await prisma.affiliateTier.update({ where: { id }, data })
      return {
        status: 200,
        body: { level: mapTier(tier), message: 'Level updated' },
      }
    } catch (err) {
      if (err?.code === 'P2002') {
        throw httpError(
          'A level with this membersRequired already exists',
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
      body: { id, message: 'Level deleted' },
    }
  }

  async reorder(auth, body = {}) {
    assertAdmin(auth)
    const ids = (body.ids || []).map((id) => String(id).trim()).filter(Boolean)
    if (!ids.length) {
      throw httpError('ids is required', 400, 'ValidationError')
    }

    const existing = await prisma.affiliateTier.findMany({
      select: { id: true },
    })
    const existingIds = new Set(existing.map((row) => row.id))
    for (const id of ids) {
      if (!existingIds.has(id)) {
        throw httpError('Tier not found', 404, 'NotFound')
      }
    }

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.affiliateTier.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    )

    const tiers = await prisma.affiliateTier.findMany({
      orderBy: [{ sortOrder: 'asc' }, { minActiveClients: 'asc' }],
    })
    const levels = tiers.map(mapTier)
    return {
      status: 200,
      body: {
        levels,
        tiers: levels,
        message: 'Levels reordered',
      },
    }
  }
}

export default new AdminAffiliateTierService()
