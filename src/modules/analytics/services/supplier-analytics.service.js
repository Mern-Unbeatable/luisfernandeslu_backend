import prisma from '../../../../lib/prisma.js'

function formatMoney(amount) {
  const val = Number(amount) || 0
  return `€${val.toLocaleString('pt-PT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

export class SupplierAnalyticsService {
  async getDashboard(supplierId) {
    if (!supplierId) {
      return {
        status: 200,
        body: this.emptyDashboard(),
      }
    }

    try {
      const orders = await prisma.order.findMany({
        where: {
          sellerId: supplierId,
          orderStatus: { notIn: ['CANCELLED'] },
        },
        include: {
          customer: {
            select: {
              id: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      })

      if (!orders || orders.length === 0) {
        return {
          status: 200,
          body: this.emptyDashboard(),
        }
      }

      const currentYear = new Date().getFullYear()
      const revenueMonthly = Array(12).fill(0)
      const expensesMonthly = Array(12).fill(0)
      const profitMonthly = Array(12).fill(0)
      const regularMonthly = Array(12).fill(0)
      const companyMonthly = Array(12).fill(0)

      let totalRevenueNum = 0
      let regularRevenueNum = 0
      let companyRevenueNum = 0

      for (const ord of orders) {
        const amount = Number(ord.subTotal || ord.grandTotal || 0)
        totalRevenueNum += amount

        const isCompany =
          String(ord.customer?.role || '').toLowerCase() === 'company'
        if (isCompany) {
          companyRevenueNum += amount
        } else {
          regularRevenueNum += amount
        }

        const date = new Date(ord.createdAt)
        if (date.getFullYear() === currentYear) {
          const month = date.getMonth()
          revenueMonthly[month] += amount
          profitMonthly[month] += amount
          if (isCompany) {
            companyMonthly[month] += amount
          } else {
            regularMonthly[month] += amount
          }
        }
      }

      const regularPercent =
        totalRevenueNum > 0
          ? Math.round((regularRevenueNum / totalRevenueNum) * 100)
          : 0
      const companyPercent =
        totalRevenueNum > 0 ? 100 - regularPercent : 0

      return {
        status: 200,
        body: {
          stats: {
            totalRevenue: formatMoney(totalRevenueNum),
            totalRevenueGrowth: '0%',
            procurementExpenses: '€0',
            netProfit: formatMoney(totalRevenueNum),
            outstandingDues: '€0',
          },
          revenueExpensesProfit: {
            revenue: revenueMonthly,
            expenses: expensesMonthly,
            profit: profitMonthly,
          },
          revenueBreakdown: {
            regular: {
              percent: regularPercent,
              amount: formatMoney(regularRevenueNum),
              value: regularRevenueNum,
              color: '#3B82F6',
            },
            company: {
              percent: companyPercent,
              amount: formatMoney(companyRevenueNum),
              value: companyRevenueNum,
              color: '#14B8A6',
            },
          },
          salesByCustomerType: {
            regular: regularMonthly,
            company: companyMonthly,
          },
          insight:
            totalRevenueNum > 0
              ? `Vendas B2B representam ${companyPercent}% da receita total.`
              : '',
        },
      }
    } catch {
      return {
        status: 200,
        body: this.emptyDashboard(),
      }
    }
  }

  emptyDashboard() {
    return {
      stats: {
        totalRevenue: '€0',
        totalRevenueGrowth: '0%',
        procurementExpenses: '€0',
        netProfit: '€0',
        outstandingDues: '€0',
      },
      revenueExpensesProfit: {
        revenue: Array(12).fill(0),
        expenses: Array(12).fill(0),
        profit: Array(12).fill(0),
      },
      revenueBreakdown: {
        regular: {
          percent: 0,
          amount: '€0',
          value: 0,
          color: '#3B82F6',
        },
        company: {
          percent: 0,
          amount: '€0',
          value: 0,
          color: '#14B8A6',
        },
      },
      salesByCustomerType: {
        regular: Array(12).fill(0),
        company: Array(12).fill(0),
      },
      insight: '',
    }
  }
}

export default new SupplierAnalyticsService()
