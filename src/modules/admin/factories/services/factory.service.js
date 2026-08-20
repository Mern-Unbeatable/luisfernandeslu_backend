import prisma from '../../../../../lib/prisma.js'
import { formatAddressLine } from '../../../../shared/address.js'
import { httpError } from '../../../../shared/errors.js'
import { parsePagination, paginationMeta, searchFilter } from '../../../../shared/pagination.js'
import { parseStoredUrls, resolveRequestBaseUrl } from '../../../../lib/requestUrl.js'

function assertAdmin(auth) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'admin') {
    throw httpError('Only admins can manage factories', 403, 'Forbidden')
  }
  return auth
}

function normalizeStatus(raw) {
  const s = String(raw || 'all').trim().toLowerCase()
  if (s === 'pending') return 'pending'
  if (s === 'suspended') return 'suspended'
  return 'all'
}

function statusLabel(status) {
  if (status === 'ACTIVE') return 'Active'
  if (status === 'SUSPENDED') return 'Suspended'
  return 'Pending'
}

function pickPrimaryAddress(user) {
  const bridges = user.addresses || []
  const ranked = [...bridges].sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
  const warehouse = ranked.find((b) => String(b.addressType).toUpperCase() === 'WAREHOUSE')
  const shipping = ranked.find((b) => String(b.addressType).toUpperCase() === 'SHIPPING')
  return warehouse?.address || shipping?.address || ranked[0]?.address || null
}

function docsFromProfile(profile, baseUrl) {
  if (!profile) return []
  const docs = [
    ['companyCertificateUrl', 'Company Certificate'],
    ['commercialRegistrationUrl', 'Commercial Registration'],
    ['nifDocumentUrl', 'NIF Document'],
    ['idDocumentUrl', 'ID Proof'],
    ['addressProofUrl', 'Address Proof'],
    ['ibanProofUrl', 'IBAN Proof'],
  ]
  const out = []
  for (const [key, label] of docs) {
    const parsed = parseStoredUrls(profile[key], baseUrl)
    if (!parsed) continue
    const urls = Array.isArray(parsed) ? parsed : [parsed]
    out.push({ key, label, urls })
  }
  return out
}

function pendingFilter() {
  return {
    OR: [
      { status: 'PENDING_VERIFICATION' },
      {
        profile: {
          is: { verificationStatus: { in: ['UNVERIFIED', 'PENDING_REVIEW'] } },
        },
      },
    ],
  }
}

function suspendedFilter() {
  return { status: { in: ['SUSPENDED', 'BLOCKED'] } }
}

function mapListRow(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phoneNumber || null,
    registeredDate: user.createdAt.toLocaleDateString('en-CA'),
    commissionPercent: Number(user.vatRate || 0),
    status: statusLabel(user.status),
    statusCode: user.status,
  }
}

function mapDetails(user, baseUrl) {
  const profile = user.profile
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phoneNumber || null,
    status: statusLabel(user.status),
    statusCode: user.status,
    verificationStatus: profile?.verificationStatus || null,
    registered: user.createdAt.toLocaleDateString('en-CA'),
    address: formatAddressLine(pickPrimaryAddress(user)),
    documents: docsFromProfile(profile, baseUrl),
    rejectionReason: profile?.rejectionReason || null,
  }
}

async function findFactory(id) {
  const user = await prisma.user.findFirst({
    where: { id, role: 'FACTORY' },
    include: {
      profile: true,
      addresses: {
        include: { address: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      },
    },
  })
  if (!user) throw httpError('Factory not found', 404, 'NotFound')
  return user
}

class AdminFactoryService {
  async stats(auth) {
    assertAdmin(auth)
    const [totalFactories, active, underReview, suspended] = await Promise.all([
      prisma.user.count({ where: { role: 'FACTORY' } }),
      prisma.user.count({ where: { role: 'FACTORY', status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'FACTORY', ...pendingFilter() } }),
      prisma.user.count({ where: { role: 'FACTORY', ...suspendedFilter() } }),
    ])
    return {
      status: 200,
      body: {
        stats: { totalFactories, active, underReview, suspended },
        message: 'Factory management stats fetched',
      },
    }
  }

  async list(auth, query) {
    assertAdmin(auth)
    const status = normalizeStatus(query.status)
    const { page, limit, skip, take } = parsePagination(query, { defaultLimit: 20, maxLimit: 100 })

    const and = [{ role: 'FACTORY' }]
    if (status === 'pending') and.push(pendingFilter())
    if (status === 'suspended') and.push(suspendedFilter())
    const searchOr = searchFilter(query.search, ['name', 'email', 'phoneNumber'])
    if (searchOr?.length) and.push({ OR: searchOr })
    const where = { AND: and }

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          status: true,
          vatRate: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ])

    return {
      status: 200,
      body: {
        factories: rows.map(mapListRow),
        pagination: paginationMeta({ page, limit, total }),
        filters: { status, search: query.search || null },
        message: 'Factories fetched',
      },
    }
  }

  async getById(auth, factoryId, req) {
    assertAdmin(auth)
    const user = await findFactory(factoryId)
    const baseUrl = resolveRequestBaseUrl(req)
    return { status: 200, body: { factory: mapDetails(user, baseUrl), message: 'Factory details fetched' } }
  }

  async approve(auth, factoryId) {
    assertAdmin(auth)
    await findFactory(factoryId)
    await prisma.user.update({ where: { id: factoryId }, data: { status: 'ACTIVE' } })
    await prisma.businessProfile.updateMany({
      where: { userId: factoryId },
      data: { verificationStatus: 'APPROVED', rejectionReason: null },
    })
    return { status: 200, body: { id: factoryId, message: 'Factory approved' } }
  }

  async reject(auth, factoryId, body) {
    assertAdmin(auth)
    await findFactory(factoryId)
    const docs = (body.invalidDocuments || []).join(', ')
    const rejectionReason = docs ? `${body.reason} | Invalid documents: ${docs}` : body.reason
    await prisma.user.update({ where: { id: factoryId }, data: { status: 'SUSPENDED' } })
    await prisma.businessProfile.updateMany({
      where: { userId: factoryId },
      data: { verificationStatus: 'REJECTED', rejectionReason },
    })
    return { status: 200, body: { id: factoryId, message: 'Factory rejected' } }
  }

  async updateStatus(auth, factoryId, body) {
    assertAdmin(auth)
    const factory = await findFactory(factoryId)
    if (factoryId === auth.id) throw httpError('You cannot update your own status', 400, 'InvalidTarget')
    const next = String(body.status || '').toLowerCase() === 'active' ? 'ACTIVE' : 'SUSPENDED'
    await prisma.user.update({ where: { id: factoryId }, data: { status: next } })
    return {
      status: 200,
      body: {
        id: factoryId,
        status: statusLabel(next),
        message: next === 'ACTIVE' ? 'Factory renewed' : 'Factory suspended',
      },
    }
  }

  async updateCommission(auth, factoryId, body) {
    assertAdmin(auth)
    await findFactory(factoryId)
    await prisma.user.update({ where: { id: factoryId }, data: { vatRate: Number(body.commissionPercent) } })
    return {
      status: 200,
      body: {
        id: factoryId,
        commission: `${Number(body.commissionPercent)}%`,
        commissionPercent: Number(body.commissionPercent),
        message: 'Factory commission updated',
      },
    }
  }

  async remove(auth, factoryId) {
    assertAdmin(auth)
    if (factoryId === auth.id) throw httpError('You cannot delete your own account', 400, 'InvalidTarget')
    const factory = await findFactory(factoryId)
    if (!['SUSPENDED', 'BLOCKED'].includes(factory.status)) {
      throw httpError('Only suspended factories can be deleted', 400, 'MustBeSuspended')
    }
    try {
      await prisma.user.delete({ where: { id: factoryId } })
    } catch (err) {
      if (err?.code === 'P2003') {
        throw httpError(
          'Factory cannot be deleted because related records exist',
          409,
          'HasRelatedRecords',
        )
      }
      throw err
    }
    return { status: 200, body: { id: factoryId, message: 'Factory deleted' } }
  }
}

export default new AdminFactoryService()
