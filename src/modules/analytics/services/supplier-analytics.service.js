/**
 * Static dashboard payload matching frontend DEMO_SUPPLIER_ANALYTICS
 * and `analyticsApi` transformResponse.
 */
const DASHBOARD = {
  stats: {
    totalRevenue: '€174,170',
    totalRevenueGrowth: '+4.3% vs last month',
    procurementExpenses: '€106,170',
    netProfit: '€68,000',
    outstandingDues: '€42,100',
  },
  revenueExpensesProfit: {
    revenue: [
      12000, 13500, 11800, 14200, 15000, 13800, 15500, 16200, 14800, 17000,
      16500, 17400,
    ],
    expenses: [
      7200, 8100, 7000, 8600, 9100, 8400, 9400, 9800, 9000, 10300, 10000,
      10600,
    ],
    profit: [
      4800, 5400, 4800, 5600, 5900, 5400, 6100, 6400, 5800, 6700, 6500, 6800,
    ],
  },
  revenueBreakdown: {
    regular: {
      percent: 26,
      amount: '€45,230',
      value: 45230,
      color: '#3B82F6',
    },
    company: {
      percent: 74,
      amount: '€128,940',
      value: 128940,
      color: '#14B8A6',
    },
  },
  salesByCustomerType: {
    regular: [
      3200, 4100, 3800, 4500, 5600, 5200, 4800, 6100, 5500, 6800, 7200, 8000,
    ],
    company: [
      3500, 4200, 4000, 4800, 5900, 5400, 5000, 6400, 5800, 7000, 7500, 8500,
    ],
  },
  insight:
    'Insight: Company (B2B) sales account for 74% of total revenue, showing strong enterprise adoption. Regular customer sales grew 7.7% month-over-month.',
}

export class SupplierAnalyticsService {
  async getDashboard() {
    return {
      status: 200,
      body: DASHBOARD,
    }
  }
}

export default new SupplierAnalyticsService()
