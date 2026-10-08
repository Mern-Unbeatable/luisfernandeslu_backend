/**
 * Seed eupagoExternKey for all FACTORY and SUPPLIER users
 * so that offer payment split works in development.
 *
 * Usage: node --import tsx src/scripts/seed-eupago-keys.js
 */
import 'dotenv/config'
import prisma from '../../lib/prisma.js'

const KEY_PREFIXES = {
  FACTORY: 'FACT-EUPAGO-',
  SUPPLIER: 'SUPP-EUPAGO-',
}

async function main() {
  // Fake keys make every real EuPago split fail with BENEFICIARY_INVALID.
  if (process.env.NODE_ENV === 'production' || process.env.PAYMENT_PROVIDER === 'eupago') {
    throw new Error(
      'Refusing to seed fake EuPago extern keys when NODE_ENV=production or PAYMENT_PROVIDER=eupago',
    )
  }

  const roles = ['FACTORY', 'SUPPLIER']
  let total = 0

  for (const role of roles) {
    const users = await prisma.user.findMany({
      where: { role },
      select: {
        id: true,
        email: true,
        profile: { select: { id: true, eupagoExternKey: true } },
      },
    })

    for (const user of users) {
      const key = `${KEY_PREFIXES[role]}${user.id.slice(0, 8)}`

      if (user.profile) {
        await prisma.businessProfile.update({
          where: { id: user.profile.id },
          data: { eupagoExternKey: key },
        })
      } else {
        await prisma.businessProfile.create({
          data: {
            userId: user.id,
            eupagoExternKey: key,
          },
        })
      }

      console.log(`  [SET] ${role} ${user.email} → ${key}`)
      total++
    }
  }

  console.log(`\nDone. Updated ${total} user(s).`)
}

main()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
