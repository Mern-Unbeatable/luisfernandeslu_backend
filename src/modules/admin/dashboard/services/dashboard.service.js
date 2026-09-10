import prisma from '../../../../../lib/prisma.js'
import { httpError } from '../../../../shared/errors.js'
import { money } from '../../../../shared/money.js'
import { getCommissionPercent } from '../../../payments/eupago.client.js'

const MONTHS = [
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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function assertAdmin(auth) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'admin') {
    throw httpError('Only admins can view dashboard data', 403, 'Forbidden')
  }
  return auth
}

/** Compact euro label with consistent K precision so B2B+B2C ≈ all. */
function formatCompactEuro(amount) {
  const num = money(amount)
  if (Math.abs(num) >= 1_000_000) {
    return `€${(num / 1_000_000).toFixed(1)}M`
  }
  if (Math.abs(num) >= 1_000) {
    // Always 1 decimal in the K range (€21.5K + €243.4K = €264.9K).
    return `€${(num / 1_000).toFixed(1)}K`
  }
  return `€${num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

function formatCompactNumber(num) {
  return (Number(num) || 0).toLocaleString('en-US')
}

function isB2BCustomerRole(role) {
  return String(role || '').toUpperCase() === 'COMPANY'
}

function metricTriple(allValue, b2bValue, b2cValue, formatter) {
  return {
    all: formatter(allValue),
    b2b: formatter(b2bValue),
    b2c: formatter(b2cValue),
  }
}

function roundMoneySeries(series) {
  return series.map((value) => money(value))
}

class AdminDashboardService {
  async getOverview(auth, _query = {}) {
    assertAdmin(auth)

    const currentYear = new Date().getFullYear()
    const registrationsSince = new Date(Date.now() - THIRTY_DAYS_MS)
    const platformCommissionRate = getCommissionPercent() / 100

    const [
      allOrders,
      activeSuppliersCount,
      activeFactoriesCount,
      activeTransportersCount,
      activeCompanyCount,
      activeCustomerCount,
      newCompanyCount,
      newCustomerCount,
      openDisputesCount,
      commissionRows,
    ] = await Promise.all([
      prisma.order.findMany({
        where: {
          orderStatus: { not: 'CANCELLED' },
        },
        select: {
          id: true,
          grandTotal: true,
          subTotal: true,
          createdAt: true,
          customerId: true,
          customer: {
            select: {
              role: true,
            },
          },
        },
      }),

      prisma.user.count({
        where: { role: 'SUPPLIER', status: 'ACTIVE' },
      }),
      prisma.user.count({
        where: { role: 'FACTORY', status: 'ACTIVE' },
      }),
      prisma.user.count({
        where: { role: 'TRANSPORTER', status: 'ACTIVE' },
      }),
      prisma.user.count({
        where: { role: 'COMPANY', status: 'ACTIVE' },
      }),
      prisma.user.count({
        where: { role: 'CUSTOMER', status: 'ACTIVE' },
      }),
      prisma.user.count({
        where: {
          role: 'COMPANY',
          createdAt: { gte: registrationsSince },
        },
      }),
      prisma.user.count({
        where: {
          role: 'CUSTOMER',
          createdAt: { gte: registrationsSince },
        },
      }),
      prisma.dispute.count({
        where: {
          status: { in: ['OPEN', 'UNDER_REVIEW'] },
        },
      }),
      prisma.commissionTransaction.findMany({
        where: { status: { not: 'REJECTED' } },
        select: {
          commissionAmount: true,
          order: {
            select: {
              customer: { select: { role: true } },
            },
          },
        },
      }),
    ])

    let totalGmv = 0
    let b2bGmv = 0
    let b2cGmv = 0
    let b2bOrderCount = 0
    let b2cOrderCount = 0

    const thisYear = currentYear
    const lastYear = currentYear - 1

    const monthlyGmvB2BThisYear = Array(12).fill(0)
    const monthlyGmvB2CThisYear = Array(12).fill(0)
    const monthlyOrdersB2BThisYear = Array(12).fill(0)
    const monthlyOrdersB2CThisYear = Array(12).fill(0)

    const monthlyGmvB2BLastYear = Array(12).fill(0)
    const monthlyGmvB2CLastYear = Array(12).fill(0)
    const monthlyOrdersB2BLastYear = Array(12).fill(0)
    const monthlyOrdersB2CLastYear = Array(12).fill(0)

    const buyerOrderCounts = { COMPANY: new Map(), CUSTOMER: new Map() }

    for (const order of allOrders) {
      const isB2B = isB2BCustomerRole(order.customer?.role)
      const amount = money(order.grandTotal || order.subTotal || 0)
      const roleKey = isB2B ? 'COMPANY' : 'CUSTOMER'

      totalGmv = money(totalGmv + amount)
      if (isB2B) {
        b2bGmv = money(b2bGmv + amount)
        b2bOrderCount += 1
      } else {
        b2cGmv = money(b2cGmv + amount)
        b2cOrderCount += 1
      }

      if (order.customerId) {
        const map = buyerOrderCounts[roleKey]
        map.set(order.customerId, (map.get(order.customerId) || 0) + 1)
      }

      const orderDate = new Date(order.createdAt)
      const orderYear = orderDate.getFullYear()
      const monthIdx = orderDate.getMonth()

      if (orderYear === thisYear) {
        if (isB2B) {
          monthlyGmvB2BThisYear[monthIdx] = money(
            monthlyGmvB2BThisYear[monthIdx] + amount,
          )
          monthlyOrdersB2BThisYear[monthIdx] += 1
        } else {
          monthlyGmvB2CThisYear[monthIdx] = money(
            monthlyGmvB2CThisYear[monthIdx] + amount,
          )
          monthlyOrdersB2CThisYear[monthIdx] += 1
        }
      } else if (orderYear === lastYear) {
        if (isB2B) {
          monthlyGmvB2BLastYear[monthIdx] = money(
            monthlyGmvB2BLastYear[monthIdx] + amount,
          )
          monthlyOrdersB2BLastYear[monthIdx] += 1
        } else {
          monthlyGmvB2CLastYear[monthIdx] = money(
            monthlyGmvB2CLastYear[monthIdx] + amount,
          )
          monthlyOrdersB2CLastYear[monthIdx] += 1
        }
      }
    }

    let b2bCommission = 0
    let b2cCommission = 0
    for (const row of commissionRows) {
      const amount = money(row.commissionAmount || 0)
      if (isB2BCustomerRole(row.order?.customer?.role)) {
        b2bCommission = money(b2bCommission + amount)
      } else {
        b2cCommission = money(b2cCommission + amount)
      }
    }
    const totalCommission = money(b2bCommission + b2cCommission)

    // Platform revenue = marketplace take on GMV (admin commission %), not affiliate payouts.
    const totalPlatformRevenue = money(totalGmv * platformCommissionRate)
    const b2bPlatformRevenue = money(b2bGmv * platformCommissionRate)
    const b2cPlatformRevenue = money(b2cGmv * platformCommissionRate)

    const totalOrdersCount = allOrders.length
    const avgOrderValue = totalOrdersCount > 0 ? money(totalGmv / totalOrdersCount) : 0
    const b2bAvgOrderValue =
      b2bOrderCount > 0 ? money(b2bGmv / b2bOrderCount) : 0
    const b2cAvgOrderValue =
      b2cOrderCount > 0 ? money(b2cGmv / b2cOrderCount) : 0

    const activeUsersCount = activeCompanyCount + activeCustomerCount
    const newRegistrationsCount = newCompanyCount + newCustomerCount

    const metricsMap = {
      totalGmv: metricTriple(totalGmv, b2bGmv, b2cGmv, formatCompactEuro),
      b2bGmv: {
        all: formatCompactEuro(b2bGmv),
        b2b: formatCompactEuro(b2bGmv),
        b2c: '€0',
      },
      b2cGmv: {
        all: formatCompactEuro(b2cGmv),
        b2b: '€0',
        b2c: formatCompactEuro(b2cGmv),
      },
      totalRevenue: metricTriple(
        totalPlatformRevenue,
        b2bPlatformRevenue,
        b2cPlatformRevenue,
        formatCompactEuro,
      ),
      commission: metricTriple(
        totalCommission,
        b2bCommission,
        b2cCommission,
        formatCompactEuro,
      ),
      avgOrderValue: {
        all: `€${avgOrderValue}`,
        b2b: `€${b2bAvgOrderValue}`,
        b2c: `€${b2cAvgOrderValue}`,
      },
      activeUsers: metricTriple(
        activeUsersCount,
        activeCompanyCount,
        activeCustomerCount,
        formatCompactNumber,
      ),
      newRegistrations: metricTriple(
        newRegistrationsCount,
        newCompanyCount,
        newCustomerCount,
        formatCompactNumber,
      ),
      activeSuppliers: {
        all: formatCompactNumber(activeSuppliersCount),
      },
      activeFactories: {
        all: formatCompactNumber(activeFactoriesCount),
      },
      activeTransporters: {
        all: formatCompactNumber(activeTransportersCount),
      },
      openDisputes: {
        all: formatCompactNumber(openDisputesCount),
      },
    }

    const repeatByRole = { COMPANY: 0, CUSTOMER: 0 }
    const buyersByRole = { COMPANY: 0, CUSTOMER: 0 }
    for (const [, count] of buyerOrderCounts.COMPANY) {
      buyersByRole.COMPANY += 1
      if (count > 1) repeatByRole.COMPANY += 1
    }
    for (const [, count] of buyerOrderCounts.CUSTOMER) {
      buyersByRole.CUSTOMER += 1
      if (count > 1) repeatByRole.CUSTOMER += 1
    }

    // LTV = total spend / unique buyers who actually ordered (not all active accounts).
    const b2bLtv =
      buyersByRole.COMPANY > 0 ? money(b2bGmv / buyersByRole.COMPANY) : 0
    const b2cLtv =
      buyersByRole.CUSTOMER > 0 ? money(b2cGmv / buyersByRole.CUSTOMER) : 0

    const b2bRepurchase =
      buyersByRole.COMPANY > 0
        ? Math.round((repeatByRole.COMPANY / buyersByRole.COMPANY) * 100)
        : 0
    const b2cRepurchase =
      buyersByRole.CUSTOMER > 0
        ? Math.round((repeatByRole.CUSTOMER / buyersByRole.CUSTOMER) * 100)
        : 0

    // Retention: previous-month buyers who also ordered this month.
    const now = new Date()
    const thisMonth = now.getMonth()
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevMonth = prevMonthDate.getMonth()
    const prevMonthYear = prevMonthDate.getFullYear()
    const thisMonthYear = now.getFullYear()

    const buyersThisMonth = { COMPANY: new Set(), CUSTOMER: new Set() }
    const buyersPrevMonth = { COMPANY: new Set(), CUSTOMER: new Set() }
    for (const order of allOrders) {
      if (!order.customerId) continue
      const roleKey = isB2BCustomerRole(order.customer?.role)
        ? 'COMPANY'
        : 'CUSTOMER'
      const d = new Date(order.createdAt)
      const y = d.getFullYear()
      const m = d.getMonth()
      if (y === thisMonthYear && m === thisMonth) {
        buyersThisMonth[roleKey].add(order.customerId)
      } else if (y === prevMonthYear && m === prevMonth) {
        buyersPrevMonth[roleKey].add(order.customerId)
      }
    }

    function retentionRate(roleKey) {
      const prev = buyersPrevMonth[roleKey]
      if (prev.size === 0) return 0
      let retained = 0
      for (const id of prev) {
        if (buyersThisMonth[roleKey].has(id)) retained += 1
      }
      return Math.round((retained / prev.size) * 100)
    }

    return {
      metrics: metricsMap,
      rawSummary: {
        totalGmv,
        b2bGmv,
        b2cGmv,
        platformCommissionPercent: getCommissionPercent(),
        totalPlatformRevenue,
        b2bPlatformRevenue,
        b2cPlatformRevenue,
        totalCommission,
        b2bCommission,
        b2cCommission,
        totalOrdersCount,
        b2bOrderCount,
        b2cOrderCount,
        activeSuppliersCount,
        activeFactoriesCount,
        activeTransportersCount,
        activeUsersCount,
        activeCompanyCount,
        activeCustomerCount,
        newRegistrationsCount,
        newCompanyCount,
        newCustomerCount,
        openDisputesCount,
        uniqueB2bBuyers: buyersByRole.COMPANY,
        uniqueB2cBuyers: buyersByRole.CUSTOMER,
      },
      charts: {
        labels: MONTHS,
        // Monthly series are order GMV (sales volume), not platform take.
        revenue: {
          thisYear: {
            b2b: roundMoneySeries(monthlyGmvB2BThisYear),
            b2c: roundMoneySeries(monthlyGmvB2CThisYear),
          },
          lastYear: {
            b2b: roundMoneySeries(monthlyGmvB2BLastYear),
            b2c: roundMoneySeries(monthlyGmvB2CLastYear),
          },
          b2b: roundMoneySeries(monthlyGmvB2BThisYear),
          b2c: roundMoneySeries(monthlyGmvB2CThisYear),
        },
        orders: {
          thisYear: {
            b2b: monthlyOrdersB2BThisYear,
            b2c: monthlyOrdersB2CThisYear,
          },
          lastYear: {
            b2b: monthlyOrdersB2BLastYear,
            b2c: monthlyOrdersB2CLastYear,
          },
          b2b: monthlyOrdersB2BThisYear,
          b2c: monthlyOrdersB2CThisYear,
        },
      },
      performance: {
        retention: {
          b2b: retentionRate('COMPANY'),
          b2c: retentionRate('CUSTOMER'),
        },
        ltv: {
          b2b: `€${b2bLtv}`,
          b2c: `€${b2cLtv}`,
        },
        repurchase: {
          b2b: b2bRepurchase,
          b2c: b2cRepurchase,
        },
      },
    }
  }
}

export default new AdminDashboardService()
