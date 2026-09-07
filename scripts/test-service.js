import prisma from '../lib/prisma.js'
import adminDashboardService from '../src/modules/admin/dashboard/services/dashboard.service.js'

async function main() {
  const result = await adminDashboardService.getOverview({ id: 'admin-1', role: 'ADMIN' }, {})
  console.log('--- REVENUE THIS YEAR ---')
  console.log(result.charts.revenue.thisYear)
  console.log('--- REVENUE LAST YEAR ---')
  console.log(result.charts.revenue.lastYear)
  console.log('--- ORDERS THIS YEAR ---')
  console.log(result.charts.orders.thisYear)
  console.log('--- ORDERS LAST YEAR ---')
  console.log(result.charts.orders.lastYear)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
