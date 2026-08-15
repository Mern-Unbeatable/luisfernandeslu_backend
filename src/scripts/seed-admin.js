/**
 * Seed a single ADMIN user (no public admin signup).
 *
 * Usage:
 *   pnpm seed:admin
 *
 * Env (optional overrides):
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME
 */
import 'dotenv/config'
import { auth } from '../auth/auth.js'
import prisma from '../../lib/prisma.js'

const email = (process.env.ADMIN_EMAIL || 'admin@construpreco.local')
  .trim()
  .toLowerCase()
const password = process.env.ADMIN_PASSWORD || 'AdminDemo123!'
const name = process.env.ADMIN_NAME || 'Platform Admin'

async function main() {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    if (existing.role !== 'ADMIN') {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: 'ADMIN', status: 'ACTIVE' },
      })
      console.log(`Updated existing user to ADMIN: ${email}`)
    } else {
      console.log(`Admin already exists: ${email}`)
    }
    return
  }

  // Bypass public-role hook by creating via adapter then setting ADMIN
  const result = await auth.api.signUpEmail({
    body: {
      email,
      password,
      name,
      role: 'CUSTOMER',
    },
  })

  const userId = result?.user?.id
  if (!userId) {
    throw new Error('Failed to create admin user')
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  })

  console.log(`Admin created: ${email}`)
  console.log('Use this account on /admin/login')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
