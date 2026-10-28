/**
 * Fresh-install seed: one verified account per role, no products or orders.
 *
 * Usage:
 *   pnpm seed:catalog
 *   pnpm seed:promotion-plans
 *   pnpm seed:accounts
 *
 * Logins (password Password123!):
 *   customer@test.local, company@test.local, supplier@test.local,
 *   factory@test.local, transporter@test.local, affiliate@test.local
 *   admin@construpreco.local (password AdminDemo123! or ADMIN_PASSWORD)
 */
import 'dotenv/config'
import { auth } from '../auth/auth.js'
import prisma from '../../lib/prisma.js'

const PASSWORD = 'Password123!'
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@construpreco.local').trim().toLowerCase()
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminDemo123!'

const LISBON = {
  streetAddress: 'Rua Augusta 150',
  city: 'Lisboa',
  state: 'Lisboa',
  zipCode: '1100-053',
  country: 'Portugal',
  latitude: 38.7107,
  longitude: -9.1393,
}
const PORTO = {
  streetAddress: 'Rua de Santa Catarina 200',
  city: 'Porto',
  state: 'Porto',
  zipCode: '4000-442',
  country: 'Portugal',
  latitude: 41.1496,
  longitude: -8.6109,
}
const AMADORA = {
  streetAddress: 'Avenida Dom José I 45',
  city: 'Amadora',
  state: 'Lisboa',
  zipCode: '2700-103',
  country: 'Portugal',
  latitude: 38.7578,
  longitude: -9.239,
}

const ACCOUNTS = [
  {
    email: 'customer@test.local',
    name: 'Ana Costa',
    role: 'CUSTOMER',
    phone: '912000001',
    addresses: [
      ['SHIPPING', 'Casa', LISBON],
      ['BILLING', 'Casa', LISBON],
    ],
  },
  {
    email: 'company@test.local',
    name: 'Acme Construction Lda',
    role: 'COMPANY',
    phone: '912000002',
    profile: { companyName: 'Acme Construction Lda' },
    addresses: [
      ['SHIPPING', 'Obra', PORTO],
      ['BILLING', 'Sede', PORTO],
    ],
  },
  {
    email: 'supplier@test.local',
    name: 'Lisboa Materials',
    role: 'SUPPLIER',
    phone: '912000003',
    profile: { companyName: 'Lisboa Materials' },
    wallet: true,
    addresses: [
      ['WAREHOUSE', 'Armazém', LISBON],
      ['SHIPPING', 'Armazém', LISBON],
    ],
  },
  {
    email: 'factory@test.local',
    name: 'Cimento do Tejo',
    role: 'FACTORY',
    phone: '912000004',
    profile: { companyName: 'Cimento do Tejo' },
    wallet: true,
    addresses: [
      ['WAREHOUSE', 'Fábrica', AMADORA],
      ['SHIPPING', 'Fábrica', AMADORA],
    ],
  },
  {
    email: 'transporter@test.local',
    name: 'Swift Transport Co',
    role: 'TRANSPORTER',
    phone: '912000005',
    profile: { companyName: 'Swift Transport Co' },
    wallet: true,
    addresses: [['SHIPPING', 'Base', LISBON]],
  },
  {
    email: 'affiliate@test.local',
    name: 'Alex Rivers',
    role: 'AFFILIATE',
    phone: '912000006',
    referralCode: 'ALEXRIVERS15',
    profile: { companyName: 'Alex Rivers' },
    wallet: true,
    addresses: [],
  },
  {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    name: process.env.ADMIN_NAME || 'Platform Admin',
    role: 'ADMIN',
    phone: '912000000',
    addresses: [],
  },
]

const AFFILIATE_TIERS = [
  { name: 'Starter Level', minActiveClients: 0, commissionPercent: 5, sortOrder: 0, isActive: true },
  { name: 'Bronze Level', minActiveClients: 100, commissionPercent: 10, sortOrder: 1, isActive: false },
  { name: 'Silver Level', minActiveClients: 200, commissionPercent: 15, sortOrder: 2, isActive: false },
  { name: 'Gold Level', minActiveClients: 300, commissionPercent: 20, sortOrder: 3, isActive: false },
  { name: 'Premium Level', minActiveClients: 500, commissionPercent: 25, sortOrder: 4, isActive: false },
].map((tier) => ({ ...tier, description: 'Recurring Lifetime payout split' }))

async function ensureUser({ email, password = PASSWORD, name, role, phone, referralCode }) {
  const data = {
    name,
    role,
    status: 'ACTIVE',
    emailVerified: true,
    phoneNumber: phone,
    ...(referralCode ? { referralCode } : {}),
  }
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return prisma.user.update({ where: { id: existing.id }, data })

  // Public signup rejects ADMIN; create as CUSTOMER and promote.
  const result = await auth.api.signUpEmail({
    body: { email, password, name, role: role === 'ADMIN' ? 'CUSTOMER' : role },
  })
  const userId = result?.user?.id
  if (!userId) throw new Error(`Failed to create user ${email}`)
  return prisma.user.update({ where: { id: userId }, data })
}

async function ensureAddress(userId, addressType, title, location) {
  const existing = await prisma.userAddressBridge.findFirst({ where: { userId, addressType } })
  if (existing) return
  const address = await prisma.address.create({ data: { title, ...location } })
  await prisma.userAddressBridge.create({
    data: { userId, addressId: address.id, addressType, isDefault: true },
  })
}

async function main() {
  for (const account of ACCOUNTS) {
    const user = await ensureUser(account)
    if (account.profile) {
      const profile = { ...account.profile, verificationStatus: 'APPROVED' }
      await prisma.businessProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...profile },
        update: profile,
      })
    }
    for (const [type, title, location] of account.addresses) {
      await ensureAddress(user.id, type, title, location)
    }
    if (account.wallet) {
      await prisma.wallet.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} })
    }
    console.log(`  ${account.role.padEnd(11)} ${account.email}`)
  }

  for (const tier of AFFILIATE_TIERS) {
    await prisma.affiliateTier.upsert({
      where: { minActiveClients: tier.minActiveClients },
      create: tier,
      update: {},
    })
  }
  console.log(`Affiliate tiers: ${AFFILIATE_TIERS.length}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
