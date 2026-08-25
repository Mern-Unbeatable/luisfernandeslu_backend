import prisma from '../../../../../lib/prisma.js'
import { absolutizeUrl } from '../../../../lib/requestUrl.js'
import { httpError, notFound } from '../../../../shared/errors.js'
import { money } from '../../../../shared/money.js'
import { parsePagination, paginationMeta, searchFilter } from '../../../../shared/pagination.js'
import {
  activeSinceDate,
  dateOnly,
  isReferralActive,
  nextTier,
  referralExpiryDate,
  resolveTier,
} from '../../../affiliates/helpers.js'

const BUYER_ROLES = ['CUSTOMER', 'COMPANY']
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function assertAdmin(auth) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'admin') {
    throw httpError('Admin access required', 403, 'Forbidden')
  }
}

function accountStatus(status) {
  const key = String(status || '').toUpperCase()
  if (key === 'SUSPENDED' || key === 'BLOCKED') return 'suspended'
  return 'active'
}

function commissionStatus(status) {
  const key = String(status || '').toUpperCase()
  if (key === 'CLEARED') return 'approved'
  if (key === 'REJECTED') return 'rejected'
  return 'pending'
}

function payoutStatus(status) {
  const key = String(status || '').toUpperCase()
  if (key === 'COMPLETED') return 'paid'
  if (key === 'PROCESSING') return 'approved'
  if (key === 'REJECTED') return 'rejected'
  return 'pending'
}

function parseAccountStatusFilter(raw) {
  const s = String(raw || 'all').trim().toLowerCase()
  if (s === 'active') return { status: 'ACTIVE' }
  if (s === 'suspended') return { status: { in: ['SUSPENDED', 'BLOCKED'] } }
  return {}
}

function parseCommissionStatusFilter(raw) {
  const s = String(raw || 'all').trim().toLowerCase()
  if (s === 'approved' || s === 'cleared') return { status: 'CLEARED' }
  if (s === 'rejected') return { status: 'REJECTED' }
  if (s === 'pending') return { status: 'PENDING' }
  return {}
}

function parsePayoutStatusFilter(raw) {
  const s = String(raw || 'all').trim().toLowerCase()
  if (s === 'paid' || s === 'completed') return { status: 'COMPLETED' }
  if (s === 'approved' || s === 'processing') return { status: 'PROCESSING' }
  if (s === 'rejected') return { status: 'REJECTED' }
  if (s === 'pending') return { status: 'PENDING' }
  return {}
}

function toPayoutDbStatus(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'paid' || s === 'completed') return 'COMPLETED'
  if (s === 'approved' || s === 'processing') return 'PROCESSING'
  if (s === 'rejected') return 'REJECTED'
  if (s === 'pending') return 'PENDING'
  return null
}

function planLabel(role) {
  if (String(role).toUpperCase() === 'COMPANY') return 'Company'
  return 'Customer'
}

async function loadTiers() {
  return prisma.affiliateTier.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { minActiveClients: 'asc' }],
  })
}

async function findAffiliate(id) {
  const user = await prisma.user.findFirst({
    where: { id, role: 'AFFILIATE' },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      image: true,
      status: true,
      referralCode: true,
      createdAt: true,
    },
  })
  if (!user) throw notFound('Affiliate not found')
  return user
}

function emptyMoneyByAffiliate() {
  return { sale: 0, earned: 0, pending: 0, cleared: 0 }
}

function tallyCommissions(rows) {
  const map = new Map()
  for (const row of rows) {
    const current = map.get(row.affiliateId) || emptyMoneyByAffiliate()
    const sale = Number(row._sum.saleAmount || 0)
    const earned = Number(row._sum.commissionAmount || 0)
    current.sale += sale
    if (row.status === 'PENDING') current.pending += earned
    if (row.status === 'CLEARED') current.cleared += earned
    if (row.status !== 'REJECTED') current.earned += earned
    map.set(row.affiliateId, current)
  }
  return map
}

async function commissionTotalsByAffiliate(affiliateIds) {
  if (!affiliateIds.length) return new Map()
  const rows = await prisma.commissionTransaction.groupBy({
    by: ['affiliateId', 'status'],
    where: { affiliateId: { in: affiliateIds } },
    _sum: { commissionAmount: true, saleAmount: true },
  })
  return tallyCommissions(rows)
}

async function clientCountsByAffiliate(affiliateIds) {
  const total = new Map()
  const active = new Map()
  if (!affiliateIds.length) return { total, active }

  const [allRows, activeRows] = await Promise.all([
    prisma.user.groupBy({
      by: ['referredById'],
      where: {
        referredById: { in: affiliateIds },
        role: { in: BUYER_ROLES },
      },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ['referredById'],
      where: {
        referredById: { in: affiliateIds },
        role: { in: BUYER_ROLES },
        createdAt: { gte: activeSinceDate() },
      },
      _count: { _all: true },
    }),
  ])

  for (const row of allRows) {
    total.set(row.referredById, row._count._all)
  }
  for (const row of activeRows) {
    active.set(row.referredById, row._count._all)
  }
  return { total, active }
}

function mapMemberRow(user, totals, clientCounts, tiers) {
  const moneyRow = totals.get(user.id) || emptyMoneyByAffiliate()
  const totalClients = clientCounts.total.get(user.id) || 0
  const activeClients = clientCounts.active.get(user.id) || 0
  const current = resolveTier(tiers, activeClients)
  const upcoming = nextTier(tiers, activeClients)
  return {
    id: user.id,
    affiliateId: user.id,
    name: user.name,
    email: user.email,
    referralCode: user.referralCode || '',
    level: current?.name || '',
    tierRate: Number(current?.commissionPercent || 0),
    totalClients,
    activeClients,
    clientCap: upcoming?.minActiveClients ?? current?.minActiveClients ?? activeClients,
    revenueGenerated: money(moneyRow.sale),
    commissionEarned: money(moneyRow.earned),
    pendingCommission: money(moneyRow.pending),
    status: accountStatus(user.status),
    joined: dateOnly(user.createdAt),
  }
}

export class AdminAffiliateService {
  async stats(auth) {
    assertAdmin(auth)
    const [
      totalAffiliates,
      activeAffiliates,
      referredClients,
      saleAgg,
      paidAgg,
      pendingAgg,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'AFFILIATE' } }),
      prisma.user.count({ where: { role: 'AFFILIATE', status: 'ACTIVE' } }),
      prisma.user.count({
        where: {
          referredById: { not: null },
          role: { in: BUYER_ROLES },
          referrer: { role: 'AFFILIATE' },
        },
      }),
      prisma.commissionTransaction.aggregate({
        where: { status: { not: 'REJECTED' } },
        _sum: { saleAmount: true },
      }),
      prisma.commissionTransaction.aggregate({
        where: { status: 'CLEARED' },
        _sum: { commissionAmount: true },
      }),
      prisma.commissionTransaction.aggregate({
        where: { status: 'PENDING' },
        _sum: { commissionAmount: true },
      }),
    ])

    return {
      status: 200,
      body: {
        stats: {
          totalAffiliates,
          activeAffiliates,
          referredClients,
          marketplaceRevenue: money(saleAgg._sum.saleAmount || 0),
          totalCommissionPaid: money(paidAgg._sum.commissionAmount || 0),
          pendingCommission: money(pendingAgg._sum.commissionAmount || 0),
        },
        message: 'Affiliate stats fetched',
      },
    }
  }

  async list(auth, query = {}) {
    assertAdmin(auth)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 7,
      maxLimit: 100,
    })
    const where = {
      role: 'AFFILIATE',
      ...parseAccountStatusFilter(query.status),
    }
    const searchOr = searchFilter(query.search, [
      'name',
      'email',
      'referralCode',
    ])
    if (searchOr) where.OR = searchOr

    const [total, rows, tiers] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          referralCode: true,
          createdAt: true,
        },
      }),
      loadTiers(),
    ])

    const ids = rows.map((row) => row.id)
    const [totals, clientCounts] = await Promise.all([
      commissionTotalsByAffiliate(ids),
      clientCountsByAffiliate(ids),
    ])

    return {
      status: 200,
      body: {
        affiliates: rows.map((row) =>
          mapMemberRow(row, totals, clientCounts, tiers),
        ),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Affiliates fetched',
      },
    }
  }

  async getById(auth, affiliateId, baseUrl) {
    assertAdmin(auth)
    const user = await findAffiliate(affiliateId)
    const [tiers, totals, clientCounts] = await Promise.all([
      loadTiers(),
      commissionTotalsByAffiliate([user.id]),
      clientCountsByAffiliate([user.id]),
    ])
    const row = mapMemberRow(user, totals, clientCounts, tiers)
    const moneyRow = totals.get(user.id) || emptyMoneyByAffiliate()
    return {
      status: 200,
      body: {
        affiliate: {
          ...row,
          phone: user.phoneNumber || '',
          avatarUrl: user.image ? absolutizeUrl(user.image, baseUrl) : null,
          revenue: money(moneyRow.sale),
          earned: money(moneyRow.earned),
          clients: row.totalClients,
        },
        message: 'Affiliate details fetched',
      },
    }
  }

  async updateStatus(auth, affiliateId, body = {}) {
    assertAdmin(auth)
    const user = await findAffiliate(affiliateId)
    const next =
      String(body.status || '').toLowerCase() === 'suspended'
        ? 'SUSPENDED'
        : 'ACTIVE'
    await prisma.user.update({
      where: { id: user.id },
      data: { status: next },
    })
    return {
      status: 200,
      body: {
        id: user.id,
        status: accountStatus(next),
        message: next === 'ACTIVE' ? 'Affiliate activated' : 'Affiliate suspended',
      },
    }
  }

  async remove(auth, affiliateId) {
    assertAdmin(auth)
    const user = await findAffiliate(affiliateId)
    try {
      await prisma.$transaction(async (tx) => {
        await tx.commissionTransaction.deleteMany({
          where: { affiliateId: user.id },
        })
        await tx.user.updateMany({
          where: { referredById: user.id },
          data: { referredById: null },
        })
        await tx.user.delete({ where: { id: user.id } })
      })
    } catch (err) {
      if (err?.code === 'P2003') {
        throw httpError(
          'Affiliate cannot be deleted because related records exist',
          409,
          'HasRelatedRecords',
        )
      }
      throw err
    }
    return {
      status: 200,
      body: { id: user.id, message: 'Affiliate deleted' },
    }
  }

  async listClients(auth, affiliateId, query = {}) {
    assertAdmin(auth)
    await findAffiliate(affiliateId)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 7,
      maxLimit: 100,
    })

    const where = {
      referredById: affiliateId,
      role: { in: BUYER_ROLES },
      ...parseAccountStatusFilter(query.status),
    }
    const plan = String(query.plan || 'all').trim().toLowerCase()
    if (plan === 'customer') where.role = 'CUSTOMER'
    if (plan === 'company') where.role = 'COMPANY'

    const searchOr = searchFilter(query.search, ['name', 'email', 'phoneNumber'])
    if (searchOr) where.OR = searchOr

    const sort = String(query.sort || 'latest').toLowerCase() === 'oldest' ? 'asc' : 'desc'

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: sort },
        skip,
        take,
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          role: true,
          status: true,
          createdAt: true,
        },
      }),
    ])

    const clientIds = rows.map((row) => row.id)
    const orders = clientIds.length
      ? await prisma.order.findMany({
          where: {
            customerId: { in: clientIds },
            OR: [
              { affiliateId },
              { commission: { is: { affiliateId } } },
            ],
          },
          select: {
            customerId: true,
            grandTotal: true,
            commission: { select: { commissionAmount: true } },
          },
        })
      : []

    const byClient = new Map()
    for (const order of orders) {
      const current = byClient.get(order.customerId) || { revenue: 0, commission: 0 }
      current.revenue += Number(order.grandTotal || 0)
      current.commission += Number(order.commission?.commissionAmount || 0)
      byClient.set(order.customerId, current)
    }

    return {
      status: 200,
      body: {
        clients: rows.map((row) => {
          const sums = byClient.get(row.id) || { revenue: 0, commission: 0 }
          return {
            id: row.id,
            name: row.name,
            email: row.email,
            phone: row.phoneNumber || '',
            joinDate: dateOnly(row.createdAt),
            plan: planLabel(row.role),
            generatedRevenue: money(sums.revenue),
            affiliateCommission: money(sums.commission),
            expiryDate: dateOnly(referralExpiryDate(row.createdAt)),
            status: accountStatus(row.status),
            referralActive: isReferralActive(row.createdAt),
          }
        }),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Referred clients fetched',
      },
    }
  }

  async analytics(auth, affiliateId, query = {}) {
    assertAdmin(auth)
    await findAffiliate(affiliateId)
    const year = Number(query.year) || new Date().getUTCFullYear()
    const yearStart = new Date(Date.UTC(year, 0, 1))
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1))

    const rows = await prisma.commissionTransaction.findMany({
      where: {
        affiliateId,
        status: { not: 'REJECTED' },
        createdAt: { gte: yearStart, lt: yearEnd },
      },
      select: { saleAmount: true, commissionAmount: true, createdAt: true },
    })

    const marketplace = Array.from({ length: 12 }, () => 0)
    const commission = Array.from({ length: 12 }, () => 0)
    for (const row of rows) {
      const month = new Date(row.createdAt).getUTCMonth()
      marketplace[month] = money(marketplace[month] + Number(row.saleAmount || 0))
      commission[month] = money(
        commission[month] + Number(row.commissionAmount || 0),
      )
    }

    const points = MONTH_LABELS.map((month, index) => ({
      month,
      marketplaceRevenue: marketplace[index],
      affiliateCommission: commission[index],
    }))

    return {
      status: 200,
      body: {
        analytics: {
          year,
          period: 'thisYear',
          labels: MONTH_LABELS,
          marketplaceRevenue: marketplace,
          affiliateCommission: commission,
          points,
        },
        message: 'Affiliate analytics fetched',
      },
    }
  }

  async listCommissions(auth, affiliateId, query = {}) {
    assertAdmin(auth)
    await findAffiliate(affiliateId)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 7,
      maxLimit: 100,
    })
    const where = {
      affiliateId,
      ...parseCommissionStatusFilter(query.status),
    }

    const [total, rows] = await Promise.all([
      prisma.commissionTransaction.count({ where }),
      prisma.commissionTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          order: {
            select: {
              customer: {
                select: { name: true, email: true },
              },
            },
          },
        },
      }),
    ])

    return {
      status: 200,
      body: {
        commissions: rows.map((row) => {
          const sale = money(row.saleAmount)
          const earned = money(row.commissionAmount)
          const rate = sale > 0 ? money((earned / sale) * 100) : 0
          const sourceName = row.order?.customer?.name || ''
          return {
            id: row.id,
            transactionLabel: sourceName,
            date: dateOnly(row.createdAt),
            sourceName,
            sourceEmail: row.order?.customer?.email || '',
            purchaseSize: sale,
            rate,
            earned,
            status: commissionStatus(row.status),
          }
        }),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Commission history fetched',
      },
    }
  }

  async listPayouts(auth, affiliateId, query = {}) {
    assertAdmin(auth)
    await findAffiliate(affiliateId)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 7,
      maxLimit: 100,
    })
    const where = {
      userId: affiliateId,
      ...parsePayoutStatusFilter(query.status),
    }

    const [total, rows] = await Promise.all([
      prisma.withdrawalRequest.count({ where }),
      prisma.withdrawalRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip,
        take,
      }),
    ])

    return {
      status: 200,
      body: {
        payouts: rows.map((row) => ({
          id: row.id,
          referenceId: row.id,
          requestedDate: dateOnly(row.requestedAt),
          method: 'IBAN',
          accountNumber: row.accountNumber,
          amount: money(row.amount),
          status: payoutStatus(row.status),
        })),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Payout history fetched',
      },
    }
  }

  async listPayoutRequests(auth, query = {}) {
    assertAdmin(auth)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 7,
      maxLimit: 100,
    })
    const where = {
      user: { role: 'AFFILIATE' },
      ...parsePayoutStatusFilter(query.status),
    }
    const term = String(query.search || '').trim()
    if (term) {
      where.OR = [
        { accountNumber: { contains: term, mode: 'insensitive' } },
        { user: { name: { contains: term, mode: 'insensitive' } } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
      ]
    }

    const [total, rows] = await Promise.all([
      prisma.withdrawalRequest.count({ where }),
      prisma.withdrawalRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              wallet: { select: { pendingBalance: true } },
            },
          },
        },
      }),
    ])

    const affiliateIds = [...new Set(rows.map((row) => row.userId))]
    const totals = await commissionTotalsByAffiliate(affiliateIds)

    return {
      status: 200,
      body: {
        payouts: rows.map((row) => {
          const moneyRow = totals.get(row.userId) || emptyMoneyByAffiliate()
          const isOpen = row.status === 'PENDING' || row.status === 'PROCESSING'
          return {
            id: row.id,
            name: row.user?.name || '',
            email: row.user?.email || '',
            totalEarnings: money(moneyRow.earned),
            requested: money(row.amount),
            pending: isOpen
              ? money(row.amount)
              : money(row.user?.wallet?.pendingBalance || 0),
            accountNumber: row.accountNumber,
            requestDate: dateOnly(row.requestedAt),
            status: payoutStatus(row.status),
          }
        }),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Payout requests fetched',
      },
    }
  }

  async updatePayoutStatus(auth, payoutId, body = {}) {
    assertAdmin(auth)
    const next = toPayoutDbStatus(body.status)
    if (!next) {
      throw httpError('Status must be paid, approved, or rejected', 400, 'InvalidStatus')
    }

    const row = await prisma.withdrawalRequest.findFirst({
      where: { id: payoutId, user: { role: 'AFFILIATE' } },
    })
    if (!row) throw notFound('Payout request not found')

    if (row.status === next) {
      return {
        status: 200,
        body: {
          id: row.id,
          status: payoutStatus(row.status),
          message: 'Payout status unchanged',
        },
      }
    }

    const wasOpen = row.status === 'PENDING' || row.status === 'PROCESSING'
    await prisma.$transaction(async (tx) => {
      if (next === 'REJECTED' && wasOpen) {
        await tx.wallet.updateMany({
          where: { userId: row.userId },
          data: { availableBalance: { increment: row.amount } },
        })
      }
      await tx.withdrawalRequest.update({
        where: { id: row.id },
        data: {
          status: next,
          processedAt: next === 'PENDING' ? null : new Date(),
        },
      })
    })

    return {
      status: 200,
      body: {
        id: row.id,
        status: payoutStatus(next),
        message: 'Payout status updated',
      },
    }
  }
}

export default new AdminAffiliateService()
