import { hashPassword, verifyPassword } from 'better-auth/crypto'
import prisma from '../../../../lib/prisma.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { httpError } from '../../../shared/errors.js'
import { money } from '../../../shared/money.js'
import { parsePagination, paginationMeta, searchFilter } from '../../../shared/pagination.js'
import {
  clearUserAvatar,
  replaceUserAvatar,
} from '../../../shared/upload/user-avatar.js'
import {
  activeSinceDate,
  buildShareLink,
  dateOnly,
  generateReferralCode,
  generateTrackingCode,
  isReferralActive,
  nextTier,
  referralExpiryDate,
  resolveTier,
} from '../helpers.js'

function assertAffiliate(auth) {
  if (!auth?.id || String(auth.role).toLowerCase() !== 'affiliate') {
    throw httpError('Affiliate access required', 403, 'Forbidden')
  }
}

async function ensureReferralAssets(affiliateId) {
  const user = await prisma.user.findUnique({
    where: { id: affiliateId },
    select: { id: true, referralCode: true },
  })
  if (!user) throw httpError('Affiliate not found', 404, 'NotFound')

  let referralCode = user.referralCode
  if (!referralCode) {
    for (let i = 0; i < 8; i += 1) {
      const code = generateReferralCode()
      try {
        await prisma.user.update({
          where: { id: affiliateId },
          data: { referralCode: code },
        })
        referralCode = code
        break
      } catch (err) {
        if (err?.code !== 'P2002') throw err
      }
    }
  }
  if (!referralCode) {
    throw httpError('Could not allocate referral code', 500, 'ReferralCodeError')
  }

  let link = await prisma.affiliateLink.findFirst({
    where: { affiliateId },
    orderBy: { createdAt: 'asc' },
  })
  if (!link) {
    const share = buildShareLink(referralCode)
    link = await prisma.affiliateLink.create({
      data: {
        affiliateId,
        campaignName: 'PRIMARY CHANNEL',
        targetUrl: share,
        trackingCode: generateTrackingCode(),
      },
    })
  } else if (link.targetUrl !== buildShareLink(referralCode)) {
    link = await prisma.affiliateLink.update({
      where: { id: link.id },
      data: { targetUrl: buildShareLink(referralCode) },
    })
  }

  return { referralCode, link }
}

async function loadTiers() {
  return prisma.affiliateTier.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { minActiveClients: 'asc' }],
  })
}

async function countActiveClients(affiliateId) {
  return prisma.user.count({
    where: {
      referredById: affiliateId,
      role: { in: ['CUSTOMER', 'COMPANY'] },
      createdAt: { gte: activeSinceDate() },
    },
  })
}

async function buildTierProgress(affiliateId) {
  const [tiers, activeClients] = await Promise.all([
    loadTiers(),
    countActiveClients(affiliateId),
  ])
  const current = resolveTier(tiers, activeClients)
  const upcoming = nextTier(tiers, activeClients)
  const needMore = upcoming
    ? Math.max(0, upcoming.minActiveClients - activeClients)
    : 0
  const progressBase = current?.minActiveClients ?? 0
  const progressTarget = (upcoming?.minActiveClients ?? progressBase) || 1
  const span = Math.max(1, progressTarget - progressBase)
  const progressPercent = upcoming
    ? Math.min(100, Math.round(((activeClients - progressBase) / span) * 100))
    : 100

  return {
    tiers,
    activeClients,
    current,
    upcoming,
    needMore,
    progressPercent,
    helperText: upcoming
      ? `You need ${needMore} more active clients to reach ${upcoming.name}.`
      : 'You are on the highest affiliate tier.',
  }
}

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

class AffiliateService {
  /** Overview Dashboard — stats cards, tier progress, monthly earning chart. */
  async getOverview(auth, query = {}) {
    assertAffiliate(auth)
    const year = Number(query.year) || new Date().getFullYear()
    const yearStart = new Date(Date.UTC(year, 0, 1))
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1))

    const [
      totalReferredClients,
      tierProgress,
      pendingAgg,
      paidAgg,
      monthlyRows,
    ] = await Promise.all([
      prisma.user.count({
        where: {
          referredById: auth.id,
          role: { in: ['CUSTOMER', 'COMPANY'] },
        },
      }),
      buildTierProgress(auth.id),
      prisma.commissionTransaction.aggregate({
        where: { affiliateId: auth.id, status: 'PENDING' },
        _sum: { commissionAmount: true },
      }),
      prisma.commissionTransaction.aggregate({
        where: { affiliateId: auth.id, status: 'CLEARED' },
        _sum: { commissionAmount: true },
      }),
      prisma.commissionTransaction.findMany({
        where: {
          affiliateId: auth.id,
          status: { not: 'REJECTED' },
          createdAt: { gte: yearStart, lt: yearEnd },
        },
        select: { commissionAmount: true, createdAt: true },
      }),
    ])

    const pendingCommissions = money(pendingAgg._sum.commissionAmount || 0)
    const paidCommission = money(paidAgg._sum.commissionAmount || 0)
    const totalEarnings = money(pendingCommissions + paidCommission)

    const byMonth = Array.from({ length: 12 }, () => 0)
    for (const row of monthlyRows) {
      const m = new Date(row.createdAt).getUTCMonth()
      byMonth[m] = money(byMonth[m] + Number(row.commissionAmount || 0))
    }
    const earningAnalytics = MONTH_LABELS.map((month, index) => ({
      month,
      monthIndex: index + 1,
      amount: byMonth[index],
    }))

    const { current, upcoming, activeClients, needMore, progressPercent, helperText } =
      tierProgress

    return {
      status: 200,
      body: {
        overview: {
          stats: {
            totalReferredClients,
            activeClients,
            pendingCommissions,
            paidCommission,
            totalEarnings,
          },
          tier: {
            currentTier: current
              ? {
                  id: current.id,
                  name: current.name,
                  commissionPercent: current.commissionPercent,
                  minActiveClients: current.minActiveClients,
                }
              : null,
            nextTier: upcoming
              ? {
                  id: upcoming.id,
                  name: upcoming.name,
                  commissionPercent: upcoming.commissionPercent,
                  minActiveClients: upcoming.minActiveClients,
                  clientsNeeded: needMore,
                }
              : null,
            activeClients,
            progressCurrent: activeClients,
            progressTarget: upcoming?.minActiveClients ?? activeClients,
            progressPercent,
            helperText,
          },
          earningAnalytics: {
            year,
            points: earningAnalytics,
          },
        },
        message: 'Affiliate overview fetched',
      },
    }
  }

  async getReferralChannel(auth) {
    assertAffiliate(auth)
    const { referralCode, link } = await ensureReferralAssets(auth.id)
    const shareLink = buildShareLink(referralCode)

    return {
      status: 200,
      body: {
        channel: {
          id: link.id,
          label: link.campaignName || 'PRIMARY CHANNEL',
          status: 'active',
          isPrimary: true,
          referralCode,
          shareLink,
          trackingCode: link.trackingCode,
          totalClicks: link.totalClicks,
          totalConversions: link.totalConversions,
        },
        message: 'Referral channel fetched',
      },
    }
  }

  async listReferredClients(auth, query = {}) {
    assertAffiliate(auth)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 10,
      maxLimit: 50,
    })

    const where = {
      referredById: auth.id,
      role: { in: ['CUSTOMER', 'COMPANY'] },
    }
    const searchOr = searchFilter(query.search, ['name', 'email'])
    if (searchOr) where.OR = searchOr

    const [total, rows] = await Promise.all([
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
          role: true,
          createdAt: true,
        },
      }),
    ])

    const clients = await Promise.all(
      rows.map(async (u) => {
        const orders = await prisma.order.findMany({
          where: {
            customerId: u.id,
            OR: [{ affiliateId: auth.id }, { commission: { is: { affiliateId: auth.id } } }],
          },
          select: {
            grandTotal: true,
            commission: {
              select: { commissionAmount: true },
            },
          },
        })

        const revenue = money(
          orders.reduce((sum, o) => sum + Number(o.grandTotal || 0), 0),
        )
        const commissionEarned = money(
          orders.reduce(
            (sum, o) => sum + Number(o.commission?.commissionAmount || 0),
            0,
          ),
        )
        const expiry = referralExpiryDate(u.createdAt)
        const active = isReferralActive(u.createdAt)

        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: String(u.role).toLowerCase(),
          registeredDate: dateOnly(u.createdAt),
          revenueGenerated: revenue,
          commissionEarned,
          commissionExpiry: dateOnly(expiry),
          status: active ? 'active' : 'expired',
        }
      }),
    )

    return {
      status: 200,
      body: {
        clients,
        pagination: paginationMeta({ page, limit, total }),
        message: 'Referred clients fetched',
      },
    }
  }

  async getLevels(auth) {
    assertAffiliate(auth)
    const {
      tiers,
      activeClients,
      current,
      upcoming,
      needMore,
      progressPercent,
      helperText,
    } = await buildTierProgress(auth.id)

    return {
      status: 200,
      body: {
        status: {
          activeClients,
          currentTier: current
            ? {
                id: current.id,
                name: current.name,
                minActiveClients: current.minActiveClients,
                commissionPercent: current.commissionPercent,
              }
            : null,
          nextTier: upcoming
            ? {
                id: upcoming.id,
                name: upcoming.name,
                minActiveClients: upcoming.minActiveClients,
                commissionPercent: upcoming.commissionPercent,
                clientsNeeded: needMore,
              }
            : null,
          progressPercent,
          helperText,
        },
        tiers: tiers.map((t) => ({
          id: t.id,
          name: t.name,
          minActiveClients: t.minActiveClients,
          commissionPercent: t.commissionPercent,
          isCurrent: current?.id === t.id,
          description: 'Recurring payout split',
        })),
        message: 'Affiliate levels fetched',
      },
    }
  }

  async getEarnings(auth, query = {}) {
    assertAffiliate(auth)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 10,
      maxLimit: 50,
    })

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const [wallet, monthAgg, lifeAgg, withdrawals, withdrawalTotal] =
      await Promise.all([
        prisma.wallet.findUnique({ where: { userId: auth.id } }),
        prisma.commissionTransaction.aggregate({
          where: {
            affiliateId: auth.id,
            createdAt: { gte: startOfMonth },
            status: { not: 'REJECTED' },
          },
          _sum: { commissionAmount: true },
        }),
        prisma.commissionTransaction.aggregate({
          where: {
            affiliateId: auth.id,
            status: { not: 'REJECTED' },
          },
          _sum: { commissionAmount: true },
        }),
        prisma.withdrawalRequest.findMany({
          where: { userId: auth.id },
          orderBy: { requestedAt: 'desc' },
          skip,
          take,
        }),
        prisma.withdrawalRequest.count({ where: { userId: auth.id } }),
      ])

    const monthTotal = money(monthAgg._sum.commissionAmount || 0)
    const lifeTotal = money(lifeAgg._sum.commissionAmount || 0)
    const available = money(wallet?.availableBalance || 0)
    const pending = money(wallet?.pendingBalance || 0)

    const profile = await prisma.businessProfile.findUnique({
      where: { userId: auth.id },
      select: { ibanNumber: true, companyName: true },
    })

    return {
      status: 200,
      body: {
        summary: {
          totalEarningsThisMonth: monthTotal,
          availableBalance: available,
          pendingAmount: pending,
          totalEarningsLifetime: lifeTotal,
          ibanNumber: profile?.ibanNumber || null,
          businessName: profile?.companyName || null,
        },
        paymentHistory: withdrawals.map((w) => ({
          id: w.id,
          date: dateOnly(w.requestedAt),
          type: 'Withdrawal',
          accountType: 'IBAN',
          accountNumber: w.accountNumber,
          amount: money(w.amount),
          status: String(w.status || '').toLowerCase(),
        })),
        pagination: paginationMeta({
          page,
          limit,
          total: withdrawalTotal,
        }),
        message: 'Earnings fetched',
      },
    }
  }

  async requestWithdrawal(auth, body = {}) {
    assertAffiliate(auth)
    const amount = money(body.amount)
    if (!(amount > 0)) {
      throw httpError('Amount must be greater than 0', 400, 'ValidationError')
    }

    const profile = await prisma.businessProfile.findUnique({
      where: { userId: auth.id },
      select: { ibanNumber: true, companyName: true },
    })
    const accountNumber =
      String(body.accountNumber || body.iban || profile?.ibanNumber || '').trim()
    if (!accountNumber) {
      throw httpError('IBAN / account number is required', 400, 'ValidationError')
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId: auth.id } })
    const available = money(wallet?.availableBalance || 0)
    if (amount > available) {
      throw httpError('Insufficient available balance', 400, 'InsufficientBalance')
    }

    const row = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { userId: auth.id },
        data: { availableBalance: { decrement: amount } },
      })
      return tx.withdrawalRequest.create({
        data: {
          userId: auth.id,
          amount,
          accountNumber,
          status: 'PENDING',
        },
      })
    })

    return {
      status: 201,
      body: {
        withdrawal: {
          id: row.id,
          amount: money(row.amount),
          accountNumber: row.accountNumber,
          status: String(row.status).toLowerCase(),
          requestedAt: row.requestedAt,
        },
        message: 'Withdrawal request submitted',
      },
    }
  }

  async getProfile(auth, baseUrl) {
    assertAffiliate(auth)
    const user = await prisma.user.findUnique({
      where: { id: auth.id },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        image: true,
        role: true,
        status: true,
        referralCode: true,
        profile: {
          select: {
            companyName: true,
            ibanNumber: true,
            verificationStatus: true,
          },
        },
      },
    })
    if (!user) throw httpError('Affiliate not found', 404, 'NotFound')

    return {
      status: 200,
      body: {
        profile: {
          id: user.id,
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber,
          avatarUrl: user.image ? absolutizeUrl(user.image, baseUrl) : null,
          role: 'affiliate',
          status: user.status,
          referralCode: user.referralCode,
          companyName: user.profile?.companyName || null,
          ibanNumber: user.profile?.ibanNumber || null,
          verificationStatus: user.profile?.verificationStatus || null,
        },
        message: 'Profile fetched',
      },
    }
  }

  async updateProfile(auth, body = {}) {
    assertAffiliate(auth)
    const name = body.name != null ? String(body.name).trim() : undefined
    const phoneNumber =
      body.phoneNumber != null || body.phone != null
        ? String(body.phoneNumber || body.phone).trim()
        : undefined
    const email =
      body.email != null ? String(body.email).trim().toLowerCase() : undefined

    if (email) {
      const clash = await prisma.user.findFirst({
        where: { email, NOT: { id: auth.id } },
        select: { id: true },
      })
      if (clash) throw httpError('Email already in use', 409, 'Conflict')
    }

    const data = {}
    if (name) data.name = name
    if (phoneNumber !== undefined) data.phoneNumber = phoneNumber || null
    if (email) data.email = email

    const user = await prisma.user.update({
      where: { id: auth.id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        profile: { select: { companyName: true, ibanNumber: true } },
      },
    })

    return {
      status: 200,
      body: {
        profile: {
          id: user.id,
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber,
          companyName: user.profile?.companyName || null,
          ibanNumber: user.profile?.ibanNumber || null,
        },
        message: 'Profile updated',
      },
    }
  }

  async changePassword(auth, body = {}) {
    assertAffiliate(auth)
    const currentPassword = String(body.currentPassword || '')
    const newPassword = String(body.newPassword || body.password || '')
    const confirm = body.confirmNewPassword ?? body.confirmPassword

    if (newPassword.length < 8) {
      throw httpError('New password must be at least 8 characters', 400, 'ValidationError')
    }
    if (confirm != null && String(confirm) !== newPassword) {
      throw httpError('Password confirmation does not match', 400, 'ValidationError')
    }

    const account = await prisma.account.findFirst({
      where: { userId: auth.id, providerId: 'credential' },
      select: { id: true, password: true },
    })
    if (!account?.password) {
      throw httpError('No password account found', 400, 'NoCredentialAccount')
    }

    const ok = await verifyPassword({
      hash: account.password,
      password: currentPassword,
    })
    if (!ok) {
      throw httpError('Current password is incorrect', 400, 'InvalidPassword')
    }

    const hashed = await hashPassword(newPassword)
    await prisma.account.update({
      where: { id: account.id },
      data: { password: hashed },
    })
    await prisma.session.deleteMany({ where: { userId: auth.id } })

    return {
      status: 200,
      body: { message: 'Password changed successfully' },
    }
  }

  async getIban(auth) {
    assertAffiliate(auth)
    const [profile, user] = await Promise.all([
      prisma.businessProfile.findUnique({
        where: { userId: auth.id },
        select: { ibanNumber: true, companyName: true },
      }),
      prisma.user.findUnique({
        where: { id: auth.id },
        select: { phoneNumber: true },
      }),
    ])

    return {
      status: 200,
      body: {
        iban: {
          ibanNumber: profile?.ibanNumber || null,
          linkedPhoneNumber: user?.phoneNumber || null,
          businessName: profile?.companyName || null,
        },
        message: 'IBAN fetched',
      },
    }
  }

  async saveIban(auth, body = {}) {
    assertAffiliate(auth)
    const ibanNumber = String(body.ibanNumber || body.iban || '').trim()
    if (ibanNumber.length < 5) {
      throw httpError('Valid IBAN is required', 400, 'ValidationError')
    }
    const linkedPhone =
      body.linkedPhoneNumber != null || body.phoneNumber != null || body.phone != null
        ? String(body.linkedPhoneNumber || body.phoneNumber || body.phone).trim()
        : undefined
    const businessName =
      body.businessName != null || body.companyName != null
        ? String(body.businessName || body.companyName).trim()
        : undefined

    await prisma.$transaction(async (tx) => {
      await tx.businessProfile.upsert({
        where: { userId: auth.id },
        create: {
          userId: auth.id,
          ibanNumber,
          companyName: businessName || null,
          verificationStatus: 'APPROVED',
        },
        update: {
          ibanNumber,
          ...(businessName !== undefined ? { companyName: businessName || null } : {}),
        },
      })
      if (linkedPhone !== undefined) {
        await tx.user.update({
          where: { id: auth.id },
          data: { phoneNumber: linkedPhone || null },
        })
      }
    })

    return this.getIban(auth).then((r) => ({
      status: 200,
      body: { ...r.body, message: 'IBAN saved' },
    }))
  }

  async uploadAvatar(auth, files, baseUrl) {
    assertAffiliate(auth)
    await replaceUserAvatar(auth.id, files)
    return this.getProfile(auth, baseUrl).then((r) => ({
      status: 200,
      body: { ...r.body, message: 'Avatar updated' },
    }))
  }

  async removeAvatar(auth, baseUrl) {
    assertAffiliate(auth)
    await clearUserAvatar(auth.id)
    return this.getProfile(auth, baseUrl).then((r) => ({
      status: 200,
      body: { ...r.body, message: 'Avatar removed' },
    }))
  }
}

export default new AffiliateService()
