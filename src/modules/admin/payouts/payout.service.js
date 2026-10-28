import prisma from '../../../../lib/prisma.js'
import { httpError, notFound } from '../../../shared/errors.js'
import { money } from '../../../shared/money.js'
import { parsePagination, paginationMeta } from '../../../shared/pagination.js'
import { companyDisplayName, partyName } from '../../../shared/party.js'
import {
  isOpenPayout,
  payoutStatusFilter,
  payoutStatusLabel,
  toPayoutDbStatus,
} from '../../../shared/payout-status.js'

/** Affiliates have their own payout screen. */
const PAYOUT_ROLES = ['SUPPLIER', 'TRANSPORTER']

function roleFilter(raw) {
  const role = String(raw || '').trim().toUpperCase()
  return PAYOUT_ROLES.includes(role) ? role : { in: PAYOUT_ROLES }
}

class AdminPayoutService {
  async list(query = {}) {
    const { page, limit, skip, take } = parsePagination(query, { defaultLimit: 7, maxLimit: 100 })
    const where = {
      user: { role: roleFilter(query.role) },
      ...payoutStatusFilter(query.status),
    }
    const term = String(query.search || '').trim()
    if (term) {
      where.OR = [
        { accountNumber: { contains: term, mode: 'insensitive' } },
        { user: { name: { contains: term, mode: 'insensitive' } } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
        { user: { profile: { companyName: { contains: term, mode: 'insensitive' } } } },
      ]
    }

    const [total, rows, pendingAgg] = await Promise.all([
      prisma.withdrawalRequest.count({ where }),
      prisma.withdrawalRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip,
        take,
        include: {
          user: {
            select: {
              name: true,
              email: true,
              role: true,
              profile: { select: { companyName: true } },
              wallet: { select: { availableBalance: true } },
            },
          },
        },
      }),
      prisma.withdrawalRequest.aggregate({
        where: { user: { role: { in: PAYOUT_ROLES } }, status: { in: ['PENDING', 'PROCESSING'] } },
        _sum: { amount: true },
      }),
    ])

    return {
      status: 200,
      body: {
        payouts: rows.map((row) => ({
          id: row.id,
          name: companyDisplayName(row.user) || partyName(row.user) || '',
          email: row.user?.email || '',
          role: String(row.user?.role || '').toLowerCase(),
          requested: money(row.amount),
          balance: money(row.user?.wallet?.availableBalance || 0),
          accountNumber: row.accountNumber,
          requestDate: row.requestedAt.toISOString().slice(0, 10),
          status: payoutStatusLabel(row.status),
        })),
        pendingTotal: money(pendingAgg._sum.amount || 0),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Payout requests fetched',
      },
    }
  }

  async updateStatus(payoutId, body = {}) {
    const next = toPayoutDbStatus(body.status)
    if (!next || next === 'PENDING') {
      throw httpError('Status must be approved, paid, or rejected', 400, 'InvalidStatus')
    }

    const row = await prisma.withdrawalRequest.findFirst({
      where: { id: payoutId, user: { role: { in: PAYOUT_ROLES } } },
    })
    if (!row) throw notFound('Payout request not found')
    if (!isOpenPayout(row.status)) {
      throw httpError('This payout request is already closed', 409, 'PayoutClosed')
    }

    await prisma.$transaction(async (tx) => {
      if (next === 'REJECTED') {
        await tx.wallet.updateMany({
          where: { userId: row.userId },
          data: { availableBalance: { increment: row.amount } },
        })
      }
      await tx.withdrawalRequest.update({
        where: { id: row.id },
        data: { status: next, processedAt: next === 'PROCESSING' ? null : new Date() },
      })
    })

    return {
      status: 200,
      body: { id: row.id, status: payoutStatusLabel(next), message: 'Payout status updated' },
    }
  }
}

export default new AdminPayoutService()
