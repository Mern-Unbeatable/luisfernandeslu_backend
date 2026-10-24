/**
 * Seed default sponsored-product pricing plans (matches UI: €40/7d, €60/15d, €100/30d).
 *
 * Usage: pnpm seed:promotion-plans
 */
import 'dotenv/config'
import prisma from '../../lib/prisma.js'

const DEFAULT_PLANS = [
  { label: 'For 7 days', durationDays: 7, price: 40, sortOrder: 1 },
  { label: 'For 15 days', durationDays: 15, price: 60, sortOrder: 2 },
  { label: 'For 30 days', durationDays: 30, price: 100, sortOrder: 3 },
]

async function main() {
  for (const plan of DEFAULT_PLANS) {
    await prisma.promotionPlan.upsert({
      where: { durationDays: plan.durationDays },
      create: {
        ...plan,
        currency: 'EUR',
        isActive: true,
      },
      update: {
        label: plan.label,
        price: plan.price,
        sortOrder: plan.sortOrder,
        isActive: true,
      },
    })
    console.log(`Plan upserted: ${plan.durationDays} days @ €${plan.price}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
