/**
 * Lists sellers whose eupagoExternKey was set by seed-eupago-keys.js
 * (FACT-EUPAGO-* / SUPP-EUPAGO-*). With --clear, removes those keys.
 *
 * Usage:
 *   node --import tsx src/scripts/check-fake-eupago-keys.js
 *   node --import tsx src/scripts/check-fake-eupago-keys.js --clear
 */
import 'dotenv/config'
import prisma from '../../lib/prisma.js'

const FAKE_PREFIXES = ['FACT-EUPAGO-', 'SUPP-EUPAGO-']

async function main() {
  const clear = process.argv.includes('--clear')

  const where = {
    OR: FAKE_PREFIXES.map((prefix) => ({
      eupagoExternKey: { startsWith: prefix },
    })),
  }

  const rows = await prisma.businessProfile.findMany({
    where,
    select: {
      id: true,
      eupagoExternKey: true,
      user: { select: { email: true, role: true } },
    },
  })

  for (const row of rows) {
    console.log(`  [FAKE] ${row.user?.role} ${row.user?.email} → ${row.eupagoExternKey}`)
  }
  console.log(`\nFound ${rows.length} fake extern key(s).`)

  if (clear && rows.length) {
    const { count } = await prisma.businessProfile.updateMany({
      where,
      data: { eupagoExternKey: null },
    })
    console.log(`Cleared ${count} fake extern key(s).`)
  } else if (rows.length) {
    console.log('Run again with --clear to remove them.')
  }
}

main()
  .catch((err) => {
    console.error('Check failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
