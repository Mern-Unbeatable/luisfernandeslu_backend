import prisma from '../lib/prisma.js'
import adminDashboardService from '../src/modules/admin/dashboard/services/dashboard.service.js'

async function main() {
  const result = await adminDashboardService.getOverview({ id: 'admin-1', role: 'ADMIN' }, {})
  console.log('--- METRICS ---')
  console.log(JSON.stringify(result.metrics, null, 2))
  console.log('--- RAW SUMMARY ---')
  console.log(JSON.stringify(result.rawSummary, null, 2))
  console.log('--- PERFORMANCE ---')
  console.log(JSON.stringify(result.performance, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
