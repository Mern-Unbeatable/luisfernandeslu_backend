import prisma from '../../../../lib/prisma.js'
import { money } from '../../../shared/money.js'
import { parsePagination, paginationMeta } from '../../../shared/pagination.js'
import { httpError } from '../../../shared/errors.js'
import { getCommissionPercent } from '../../payments/eupago.client.js'

const COMPLETED_STATUSES = new Set(['DELIVERED', 'COMPLETED'])
const OPEN_WITHDRAWALS = new Set(['PENDING', 'PROCESSING', 'COMPLETED'])

function assertTransporter(auth) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'transporter') {
    throw httpError('Only transporters can view payments', 403, 'Forbidden')
  }
  return auth.id
}

function resolveYear(period) {
  const now = new Date().getFullYear()
  if (period === 'lastYear') return now - 1
  if (period === 'thisYear' || period == null || period === '') return now
  const year = Number(period)
  return Number.isFinite(year) ? year : now
}

function dateOnly(d) {
  if (!d) return null
  const x = new Date(d)
  if (Number.isNaN(x.getTime())) return null
  return x.toISOString().slice(0, 10)
}

function commissionPercentOf(vatRate) {
  const custom = Number(vatRate)
  if (Number.isFinite(custom) && custom > 0) return money(custom)
  return money(getCommissionPercent())
}

function netPayout(bidAmount, percent) {
  return money(Number(bidAmount || 0) * (1 - Number(percent || 0) / 100))
}

function historyStatus(status) {
  const value = String(status || '').toUpperCase()
  if (value === 'COMPLETED') return 'approved'
  if (value === 'REJECTED') return 'rejected'
  return 'pending'
}

function mapHistoryRow(row) {
  return {
    date: dateOnly(row.requestedAt),
    type: 'withdrawal',
    accountType: 'bank_transfer',
    accountNumber: row.accountNumber || '',
    amount: money(row.amount),
    status: historyStatus(row.status),
  }
}

function niceMax(n) {
  const value = Number(n) || 0
  if (value <= 0) return 10000
  const mag = 10 ** Math.floor(Math.log10(value))
  const norm = value / mag
  let nice = 10
  if (norm <= 1) nice = 1
  else if (norm <= 2) nice = 2
  else if (norm <= 2.5) nice = 2.5
  else if (norm <= 5) nice = 5
  const top = nice * mag
  return top < value ? top * 1.25 : top
}

function monthsSince(from, to = new Date()) {
  if (!from) return 1
  const start = new Date(from)
  const months =
    (to.getFullYear() - start.getFullYear()) * 12 +
    (to.getMonth() - start.getMonth()) +
    1
  return Math.max(1, months)
}

async function loadAcceptedBids(transporterId) {
  return prisma.transporterBid.findMany({
    where: {
      transporterId,
      status: 'ACCEPTED',
      auction: {
        shipment: {
          order: { orderStatus: { not: 'CANCELLED' } },
        },
      },
    },
    select: {
      bidAmount: true,
      createdAt: true,
      auction: {
        select: {
          shipment: {
            select: {
              order: {
                select: { orderStatus: true, createdAt: true },
              },
            },
          },
        },
      },
    },
  })
}

async function buildLedger(transporterId, year) {
  const [user, bids, withdrawals, wallet] = await Promise.all([
    prisma.user.findUnique({
      where: { id: transporterId },
      select: { vatRate: true },
    }),
    loadAcceptedBids(transporterId),
    prisma.withdrawalRequest.findMany({
      where: { userId: transporterId },
      orderBy: { requestedAt: 'desc' },
    }),
    prisma.wallet.findUnique({ where: { userId: transporterId } }),
  ])

  const percent = commissionPercentOf(user?.vatRate)
  let totalEarnings = 0
  let pendingEarnings = 0
  let completedEarnings = 0
  let firstDate = null
  const monthly = Array.from({ length: 12 }, () => 0)

  for (const bid of bids) {
    const order = bid.auction?.shipment?.order
    const amount = netPayout(bid.bidAmount, percent)
    const stamp = new Date(order?.createdAt || bid.createdAt)
    totalEarnings = money(totalEarnings + amount)
    if (COMPLETED_STATUSES.has(order?.orderStatus)) {
      completedEarnings = money(completedEarnings + amount)
    } else {
      pendingEarnings = money(pendingEarnings + amount)
    }
    if (!firstDate || stamp.getTime() < firstDate) firstDate = stamp.getTime()
    if (stamp.getFullYear() === year) {
      monthly[stamp.getMonth()] = money(monthly[stamp.getMonth()] + amount)
    }
  }

  const reserved = withdrawals
    .filter((w) => OPEN_WITHDRAWALS.has(String(w.status).toUpperCase()))
    .reduce((sum, w) => money(sum + Number(w.amount || 0)), 0)

  const fromJobs = money(Math.max(0, completedEarnings - reserved))
  const availableBalance = money(
    wallet != null ? wallet.availableBalance : fromJobs,
  )

  return {
    percent,
    totalEarnings: money(totalEarnings),
    pendingEarnings: money(
      wallet != null ? wallet.pendingBalance : pendingEarnings,
    ),
    availableBalance,
    monthlyAverage: money(totalEarnings / monthsSince(firstDate)),
    monthly,
    withdrawals,
  }
}

export class TransporterPaymentsService {
  async get(auth, query = {}) {
    const transporterId = assertTransporter(auth)
    const year = resolveYear(query.period)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 7,
      maxLimit: 50,
    })
    const ledger = await buildLedger(transporterId, year)
    const peak = Math.max(0, ...ledger.monthly)
    const maxValue = niceMax(peak)
    const step = money(maxValue / 4)
    const total = ledger.withdrawals.length

    return {
      status: 200,
      body: {
        stats: {
          totalEarnings: ledger.totalEarnings,
          adminCommissionPercent: ledger.percent,
          availableBalance: ledger.availableBalance,
          pendingEarnings: ledger.pendingEarnings,
          monthlyAverage: ledger.monthlyAverage,
        },
        revenue: {
          year,
          maxValue,
          yTicks: [0, step, money(step * 2), money(step * 3), maxValue],
          points: ledger.monthly,
        },
        paymentHistory: ledger.withdrawals
          .slice(skip, skip + take)
          .map(mapHistoryRow),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Payments fetched',
      },
    }
  }

  async withdraw(auth, body = {}) {
    const transporterId = assertTransporter(auth)
    const amount = money(body.amount)
    if (!(amount > 0)) {
      throw httpError('Amount must be greater than 0', 400, 'ValidationError')
    }

    const accountNumber = String(body.iban || body.accountNumber || '').trim()
    if (!accountNumber) {
      throw httpError('IBAN is required', 400, 'ValidationError')
    }

    const ledger = await buildLedger(transporterId, resolveYear('thisYear'))
    const available = money(ledger.availableBalance)
    if (amount > available) {
      throw httpError(
        `Amount cannot exceed available balance (€${available.toFixed(2)})`,
        400,
        'InsufficientBalance',
      )
    }

    const remaining = money(available - amount)
    const row = await prisma.$transaction(async (tx) => {
      await tx.wallet.upsert({
        where: { userId: transporterId },
        create: {
          userId: transporterId,
          availableBalance: remaining,
          pendingBalance: ledger.pendingEarnings,
        },
        update: {
          availableBalance: remaining,
          pendingBalance: ledger.pendingEarnings,
        },
      })
      return tx.withdrawalRequest.create({
        data: {
          userId: transporterId,
          amount,
          accountNumber,
          status: 'PENDING',
        },
      })
    })

    return {
      status: 201,
      body: {
        ...mapHistoryRow(row),
        message: 'Withdrawal request submitted',
      },
    }
  }
}

export default new TransporterPaymentsService()

export { buildLedger, resolveYear, niceMax, netPayout, commissionPercentOf }
