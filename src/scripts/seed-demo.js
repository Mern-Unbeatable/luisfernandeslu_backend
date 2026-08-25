/**
 * Full demo seed for frontend tables.
 *
 * Usage:
 *   pnpm seed:catalog
 *   pnpm seed:demo
 *
 * Logins (password Password123! unless noted):
 *   customer@test.local
 *   company@test.local
 *   supplier@test.local
 *   factory@test.local
 *   transporter@test.local
 *   affiliate@test.local
 *   admin@construpreco.local  (password: AdminDemo123! or ADMIN_PASSWORD)
 */
import 'dotenv/config'
import crypto from 'node:crypto'
import { auth } from '../auth/auth.js'
import prisma from '../../lib/prisma.js'
import { invoiceNumber, formatAuctionCode } from '../shared/numbering.js'
import { seedAdminFilterProducts } from './seed-admin-products.js'

const PASSWORD = 'Password123!'
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@construpreco.local')
  .trim()
  .toLowerCase()
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminDemo123!'

const PT = {
  lisbon: {
    streetAddress: 'Rua Augusta 150',
    city: 'Lisbon',
    state: 'Lisboa',
    zipCode: '1100-053',
    country: 'Portugal',
    latitude: 38.7107,
    longitude: -9.1393,
  },
  porto: {
    streetAddress: 'Rua de Santa Catarina 200',
    city: 'Porto',
    state: 'Porto',
    zipCode: '4000-442',
    country: 'Portugal',
    latitude: 41.1496,
    longitude: -8.6109,
  },
  amadora: {
    streetAddress: 'Avenida Dom José I 45',
    city: 'Amadora',
    state: 'Lisboa',
    zipCode: '2700-103',
    country: 'Portugal',
    latitude: 38.7578,
    longitude: -9.239,
  },
  seteRios: {
    streetAddress: 'Rua de Campolide 88',
    city: 'Lisbon',
    state: 'Lisboa',
    zipCode: '1070-029',
    country: 'Portugal',
    latitude: 38.7324,
    longitude: -9.1631,
  },
}

async function ensureUser({ email, password, name, role, phone, status = 'ACTIVE', referralCode }) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name,
        role,
        status,
        emailVerified: true,
        phoneNumber: phone,
        ...(referralCode ? { referralCode } : {}),
      },
    })
    return prisma.user.findUnique({ where: { id: existing.id } })
  }

  const signupRole = role === 'ADMIN' ? 'CUSTOMER' : role
  const result = await auth.api.signUpEmail({
    body: {
      email,
      password,
      name,
      role: signupRole,
    },
  })
  const userId = result?.user?.id
  if (!userId) throw new Error(`Failed to create user ${email}`)

  return prisma.user.update({
    where: { id: userId },
    data: {
      role,
      status,
      emailVerified: true,
      phoneNumber: phone,
      ...(referralCode ? { referralCode } : {}),
    },
  })
}

async function ensureReferredBuyer({
  email,
  name,
  role,
  phone,
  referredById,
  status = 'ACTIVE',
}) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        name,
        role,
        status,
        emailVerified: true,
        phoneNumber: phone,
        referredById,
      },
    })
  }
  return prisma.user.create({
    data: {
      name,
      email,
      emailVerified: true,
      role,
      status,
      phoneNumber: phone,
      referredById,
    },
  })
}

async function ensureProfile(userId, data) {
  return prisma.businessProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  })
}

async function ensureAddress(userId, type, title, loc, isDefault = true) {
  const existing = await prisma.userAddressBridge.findFirst({
    where: { userId, addressType: type },
    include: { address: true },
  })
  if (existing) {
    await prisma.address.update({
      where: { id: existing.addressId },
      data: { title, ...loc },
    })
    return existing.address
  }
  const address = await prisma.address.create({
    data: { title, ...loc },
  })
  await prisma.userAddressBridge.create({
    data: {
      userId,
      addressId: address.id,
      addressType: type,
      isDefault,
    },
  })
  return address
}

async function ensureWallet(userId, available = 0, pending = 0) {
  return prisma.wallet.upsert({
    where: { userId },
    create: { userId, availableBalance: available, pendingBalance: pending },
    update: { availableBalance: available, pendingBalance: pending },
  })
}

async function leafCategory() {
  const leaf = await prisma.category.findFirst({
    where: { parentCategory: { is: { parentCategoryId: { not: null } } } },
    orderBy: { name: 'asc' },
  })
  if (!leaf) {
    throw new Error('Catalog is empty. Run: pnpm seed:catalog')
  }
  return leaf
}

async function ensureProduct(data) {
  const existing = await prisma.product.findUnique({ where: { sku: data.sku } })
  if (existing) {
    return prisma.product.update({
      where: { id: existing.id },
      data: {
        title: data.title,
        slug: data.slug,
        shortDescription: data.shortDescription,
        longDescription: data.longDescription,
        specifications: data.specifications,
        factoryName: data.factoryName,
        basePrice: data.basePrice,
        b2bPrice: data.b2bPrice,
        minOrderQuantity: data.minOrderQuantity,
        minB2bQuantity: data.minB2bQuantity,
        unitOfMeasure: data.unitOfMeasure,
        weightKg: data.weightKg,
        marketplaceTier: data.marketplaceTier,
        approvalStatus: data.approvalStatus,
        warehouseLocation: data.warehouseLocation,
        isFeatured: data.isFeatured || false,
        averageRating: data.averageRating || 0,
        reviewCount: data.reviewCount || 0,
        categoryId: data.categoryId,
        sellerId: data.sellerId,
      },
    })
  }
  return prisma.product.create({ data })
}

async function ensureMedia(productId, bannerUrl, extras = []) {
  await prisma.productMedia.deleteMany({ where: { productId } })
  await prisma.productMedia.create({
    data: {
      productId,
      mediaUrl: bannerUrl,
      isBanner: true,
      sortOrder: 0,
    },
  })
  for (let i = 0; i < extras.length; i += 1) {
    await prisma.productMedia.create({
      data: {
        productId,
        mediaUrl: extras[i],
        isBanner: false,
        sortOrder: i + 1,
      },
    })
  }
}

async function ensureFeatures(productId, texts) {
  await prisma.productFeature.deleteMany({ where: { productId } })
  await prisma.productFeature.createMany({
    data: texts.map((featureText) => ({ productId, featureText })),
  })
}

async function ensureInventory(productId, stock) {
  const row = await prisma.inventory.upsert({
    where: { productId },
    create: {
      productId,
      currentStock: stock,
      listedQuantity: stock,
      lowStockThreshold: 20,
    },
    update: { currentStock: stock, listedQuantity: stock },
  })
  const txCount = await prisma.inventoryTransaction.count({
    where: { inventoryId: row.id, sourceType: 'INITIAL' },
  })
  if (!txCount) {
    await prisma.inventoryTransaction.create({
      data: {
        inventoryId: row.id,
        quantityChange: stock,
        sourceType: 'INITIAL',
      },
    })
  }
  return row
}

async function ensureOrder(data) {
  const existing = await prisma.order.findUnique({
    where: { orderNumber: data.orderNumber },
  })
  if (existing) return existing
  return prisma.order.create({ data })
}

const AFFILIATE_DIRECTORY = [
  {
    key: 'alex',
    email: 'affiliate@test.local',
    name: 'Alex Rivers',
    phone: '912000006',
    referralCode: 'ALEXRIVERS15',
    status: 'ACTIVE',
    iban: 'PT50000600000000000000006',
  },
  {
    key: 'sarah',
    email: 'sarah.corp@test.local',
    name: 'Sarah Corp',
    phone: '912000016',
    referralCode: 'SARAHCORP10',
    status: 'ACTIVE',
    iban: 'PT50000600000000000000016',
  },
  {
    key: 'build',
    email: 'build.partners@test.local',
    name: 'Build Partners LLC',
    phone: '912000017',
    referralCode: 'BUILDPRO08',
    status: 'SUSPENDED',
    iban: 'PT50000600000000000000017',
  },
  {
    key: 'mason',
    email: 'mason.referrals@test.local',
    name: 'Mason Referrals',
    phone: '912000018',
    referralCode: 'MASON12',
    status: 'ACTIVE',
    iban: 'PT50000600000000000000018',
  },
  {
    key: 'cement',
    email: 'cement.connect@test.local',
    name: 'Cement Connect',
    phone: '912000019',
    referralCode: 'CEMENT15',
    status: 'ACTIVE',
    iban: 'PT50000600000000000000019',
  },
  {
    key: 'priya',
    email: 'priya.nair@test.local',
    name: 'Priya Nair',
    phone: '912000020',
    referralCode: 'PRIYA10',
    status: 'ACTIVE',
    iban: 'PT50000600000000000000020',
  },
  {
    key: 'north',
    email: 'northstar@test.local',
    name: 'North Star Affiliates',
    phone: '912000021',
    referralCode: 'NORTHSTAR12',
    status: 'SUSPENDED',
    iban: 'PT50000600000000000000021',
  },
]

const CLIENT_FIRST = [
  ['John Anderson', 'CUSTOMER'],
  ['Sarah Mitchell', 'CUSTOMER'],
  ['BuildPro Corp', 'COMPANY'],
  ['Metro Supplies', 'COMPANY'],
  ['Skyline Projects', 'COMPANY'],
  ['Porto Mix Plant', 'COMPANY'],
  ['Downtown Builders', 'COMPANY'],
]

const PAYOUT_STATUSES = [
  'COMPLETED',
  'REJECTED',
  'PROCESSING',
  'PENDING',
  'PENDING',
  'PROCESSING',
  'COMPLETED',
]

async function seedAffiliateDirectory({
  primaryAffiliate,
  customer,
  company,
  supplier,
  supplierProduct,
  customerShip,
  makeOrder,
}) {
  const affiliates = []
  for (const row of AFFILIATE_DIRECTORY) {
    const user =
      row.email === primaryAffiliate.email
        ? await prisma.user.update({
            where: { id: primaryAffiliate.id },
            data: {
              name: row.name,
              status: row.status,
              phoneNumber: row.phone,
              referralCode: row.referralCode,
            },
          })
        : await ensureUser({
            email: row.email,
            password: PASSWORD,
            name: row.name,
            role: 'AFFILIATE',
            phone: row.phone,
            status: row.status,
            referralCode: row.referralCode,
          })
    await ensureProfile(user.id, {
      companyName: row.name,
      ibanNumber: row.iban,
      ibanPhone: row.phone,
      verificationStatus: 'APPROVED',
    })
    await ensureWallet(user.id, 420 + affiliates.length * 80, 95 + affiliates.length * 10)
    affiliates.push(user)
  }

  await prisma.user.update({
    where: { id: customer.id },
    data: { referredById: affiliates[0].id },
  })
  await prisma.user.update({
    where: { id: company.id },
    data: { referredById: affiliates[0].id },
  })

  const referred = []
  for (let a = 0; a < affiliates.length; a += 1) {
    const aff = affiliates[a]
    for (let i = 0; i < CLIENT_FIRST.length; i += 1) {
      const [baseName, role] = CLIENT_FIRST[i]
      const name = a === 0 ? baseName : `${baseName} ${a + 1}`
      const slug = String(aff.referralCode || `aff${a}`).toLowerCase()
      const buyer = await ensureReferredBuyer({
        email: `ref-${slug}-${i + 1}@test.local`,
        name,
        role,
        phone: `91210${String(a).padStart(2, '0')}${String(i).padStart(2, '0')}`,
        referredById: aff.id,
        status: i === 1 ? 'SUSPENDED' : 'ACTIVE',
      })
      referred.push({ buyer, affiliate: aff, index: i, affIndex: a })
    }
  }

  await prisma.withdrawalRequest.deleteMany({
    where: { accountNumber: { startsWith: 'DEMO-AFF-' } },
  })

  for (let a = 0; a < affiliates.length; a += 1) {
    const aff = affiliates[a]
    for (let i = 0; i < CLIENT_FIRST.length; i += 1) {
      const slot = referred.find(
        (row) => row.affiliate.id === aff.id && row.index === i,
      )
      const month = i % 12
      const at = new Date(Date.UTC(2026, month, 4 + i, 10, 0, 0))
      const qty = 12 + i * 3 + a
      const order = await makeOrder({
        orderNumber: `ORD-DEMO-AFF-${a + 1}-${String(i + 1).padStart(2, '0')}`,
        customerId: slot.buyer.id,
        sellerId: supplier.id,
        shippingAddressId: customerShip.id,
        billingAddressId: customerShip.id,
        status: 'COMPLETED',
        source: 'DIRECT_CART',
        product: supplierProduct,
        qty,
        shippingFee: 18,
        affiliateId: aff.id,
      })
      const saleAmount = order.subTotal
      const commissionAmount = Math.round(saleAmount * 0.15 * 100) / 100
      await prisma.commissionTransaction.upsert({
        where: { orderId: order.id },
        create: {
          affiliateId: aff.id,
          orderId: order.id,
          saleAmount,
          commissionAmount,
          status: i === 0 ? 'PENDING' : 'CLEARED',
          createdAt: at,
        },
        update: {
          affiliateId: aff.id,
          saleAmount,
          commissionAmount,
          status: i === 0 ? 'PENDING' : 'CLEARED',
          createdAt: at,
        },
      })

      await prisma.withdrawalRequest.create({
        data: {
          userId: aff.id,
          amount: 800 + i * 150 + a * 40,
          accountNumber: `DEMO-AFF-${aff.referralCode}-${i + 1}`,
          status: PAYOUT_STATUSES[i],
          requestedAt: at,
          processedAt: PAYOUT_STATUSES[i] === 'PENDING' ? null : at,
        },
      })
    }
  }
}

async function main() {
  const category = await leafCategory()

  const plan7 = await prisma.promotionPlan.upsert({
    where: { durationDays: 7 },
    create: { label: 'For 7 days', durationDays: 7, price: 40, sortOrder: 1 },
    update: {},
  })
  const plan15 = await prisma.promotionPlan.upsert({
    where: { durationDays: 15 },
    create: { label: 'For 15 days', durationDays: 15, price: 60, sortOrder: 2 },
    update: {},
  })
  const plan30 = await prisma.promotionPlan.upsert({
    where: { durationDays: 30 },
    create: { label: 'For 30 days', durationDays: 30, price: 100, sortOrder: 3 },
    update: {},
  })

  const customer = await ensureUser({
    email: 'customer@test.local',
    password: PASSWORD,
    name: 'Ana Costa',
    role: 'CUSTOMER',
    phone: '912000001',
  })
  const company = await ensureUser({
    email: 'company@test.local',
    password: PASSWORD,
    name: 'Acme Construction Lda',
    role: 'COMPANY',
    phone: '912000002',
  })
  const supplier = await ensureUser({
    email: 'supplier@test.local',
    password: PASSWORD,
    name: 'Lisboa Materials',
    role: 'SUPPLIER',
    phone: '912000003',
  })
  const factory = await ensureUser({
    email: 'factory@test.local',
    password: PASSWORD,
    name: 'Cimento do Tejo',
    role: 'FACTORY',
    phone: '912000004',
  })
  const transporter = await ensureUser({
    email: 'transporter@test.local',
    password: PASSWORD,
    name: 'Swift Transport Co',
    role: 'TRANSPORTER',
    phone: '912000005',
  })
  const affiliate = await ensureUser({
    email: 'affiliate@test.local',
    password: PASSWORD,
    name: 'Alex Rivers',
    role: 'AFFILIATE',
    phone: '912000006',
    referralCode: 'ALEXRIVERS15',
  })
  const admin = await ensureUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    name: process.env.ADMIN_NAME || 'Platform Admin',
    role: 'ADMIN',
    phone: '912000000',
  })

  await prisma.user.update({
    where: { id: affiliate.id },
    data: { referralCode: 'ALEXRIVERS15' },
  })
  await prisma.user.update({
    where: { id: customer.id },
    data: { referredById: affiliate.id },
  })
  await prisma.user.update({
    where: { id: company.id },
    data: { referredById: affiliate.id },
  })

  const defaultTiers = [
    {
      name: 'Starter Level',
      minActiveClients: 0,
      commissionPercent: 5,
      sortOrder: 0,
      isActive: true,
      description: 'Recurring Lifetime payout split',
    },
    {
      name: 'Bronze Level',
      minActiveClients: 100,
      commissionPercent: 10,
      sortOrder: 1,
      isActive: false,
      description: 'Recurring Lifetime payout split',
    },
    {
      name: 'Silver Level',
      minActiveClients: 200,
      commissionPercent: 15,
      sortOrder: 2,
      isActive: false,
      description: 'Recurring Lifetime payout split',
    },
    {
      name: 'Gold Level',
      minActiveClients: 300,
      commissionPercent: 20,
      sortOrder: 3,
      isActive: false,
      description: 'Recurring Lifetime payout split',
    },
    {
      name: 'Premium Level',
      minActiveClients: 500,
      commissionPercent: 25,
      sortOrder: 4,
      isActive: false,
      description: 'Recurring Lifetime payout split',
    },
  ]
  await prisma.affiliateTier.deleteMany({})
  await prisma.affiliateTier.createMany({ data: defaultTiers })

  await ensureProfile(company.id, {
    companyName: 'Acme Construction Lda',
    nifNumber: 'PT500000001',
    verificationStatus: 'APPROVED',
  })
  await ensureProfile(supplier.id, {
    companyName: 'Lisboa Materials',
    nifNumber: 'PT500000002',
    ibanNumber: 'PT50000200000000000000002',
    verificationStatus: 'APPROVED',
  })
  await ensureProfile(factory.id, {
    companyName: 'Cimento do Tejo',
    nifNumber: 'PT500000003',
    ibanNumber: 'PT50000300000000000000003',
    verificationStatus: 'APPROVED',
  })
  await ensureProfile(transporter.id, {
    companyName: 'Swift Transport Co',
    nifNumber: 'PT500000004',
    verificationStatus: 'APPROVED',
  })
  await ensureProfile(affiliate.id, {
    companyName: 'Alex Rivers',
    ibanNumber: 'PT50000600000000000000006',
    ibanPhone: '912000006',
    verificationStatus: 'APPROVED',
  })

  const customerShip = await ensureAddress(
    customer.id,
    'SHIPPING',
    'Home',
    PT.lisbon,
  )
  await ensureAddress(customer.id, 'BILLING', 'Home billing', PT.lisbon)
  const companyShip = await ensureAddress(
    company.id,
    'SHIPPING',
    'Site A',
    PT.porto,
  )
  await ensureAddress(company.id, 'BILLING', 'HQ billing', PT.porto)
  const supplierWh = await ensureAddress(
    supplier.id,
    'WAREHOUSE',
    'Supplier warehouse',
    PT.seteRios,
  )
  await ensureAddress(supplier.id, 'SHIPPING', 'Supplier shipping', PT.seteRios)
  await ensureAddress(factory.id, 'WAREHOUSE', 'Factory warehouse', PT.amadora)
  await ensureAddress(factory.id, 'SHIPPING', 'Factory gate', PT.amadora)
  await ensureAddress(transporter.id, 'SHIPPING', 'Depot', PT.lisbon)

  await ensureWallet(supplier.id, 1250, 80)
  await ensureWallet(factory.id, 3400, 0)
  await ensureWallet(transporter.id, 500, 45)
  await ensureWallet(affiliate.id, 95, 12)

  await prisma.transporterInsurance.upsert({
    where: {
      userId_kind: { userId: transporter.id, kind: 'CIVIL' },
    },
    create: {
      userId: transporter.id,
      kind: 'CIVIL',
      provider: 'SafeGuard Insurance Co.',
      policyNumber: 'POL-CL-849372',
      coverageAmount: 1000000,
      startDate: new Date('2025-01-15T00:00:00.000Z'),
      expiryDate: new Date('2027-01-15T00:00:00.000Z'),
      status: 'VERIFIED',
    },
    update: {
      provider: 'SafeGuard Insurance Co.',
      policyNumber: 'POL-CL-849372',
      coverageAmount: 1000000,
      expiryDate: new Date('2027-01-15T00:00:00.000Z'),
      status: 'VERIFIED',
    },
  })
  await prisma.transporterInsurance.upsert({
    where: {
      userId_kind: { userId: transporter.id, kind: 'CARGO' },
    },
    create: {
      userId: transporter.id,
      kind: 'CARGO',
      provider: 'FreightSecure Insurance',
      policyNumber: 'POL-CG-394821',
      coverageAmount: 500000,
      startDate: new Date('2025-01-15T00:00:00.000Z'),
      expiryDate: new Date('2027-01-15T00:00:00.000Z'),
      status: 'VERIFIED',
    },
    update: {
      provider: 'FreightSecure Insurance',
      policyNumber: 'POL-CG-394821',
      coverageAmount: 500000,
      expiryDate: new Date('2027-01-15T00:00:00.000Z'),
      status: 'VERIFIED',
    },
  })

  const project = await prisma.project.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      userId: company.id,
      projectName: 'Porto Riverside Tower',
      location: 'Porto, Portugal',
      deliveredValue: 4200,
      duePayment: 1800,
    },
    update: { userId: company.id, projectName: 'Porto Riverside Tower' },
  })

  const supplierProduct = await ensureProduct({
    sellerId: supplier.id,
    categoryId: category.id,
    sku: 'CEM-DEMO-001',
    title: 'Portland Cement Quick Set',
    slug: 'portland-cement-quick-set-demo',
    shortDescription: 'Fast-setting cement for structural work.',
    longDescription: 'CEM I 52.5R Portland cement suitable for slabs and columns.',
    specifications: 'Type: CEM I | Weight: 50kg | EN 197-1',
    factoryName: 'Cimento do Tejo',
    basePrice: 8.5,
    b2bPrice: 7.2,
    minOrderQuantity: 10,
    unitOfMeasure: 'bags',
    weightKg: 50,
    marketplaceTier: 'RETAIL',
    approvalStatus: 'APPROVED',
    warehouseLocation: 'Rua de Campolide 88, Lisbon, Portugal',
    isFeatured: true,
    averageRating: 4.6,
    reviewCount: 1,
  })
  const supplierPending = await ensureProduct({
    sellerId: supplier.id,
    categoryId: category.id,
    sku: 'CEM-DEMO-002',
    title: 'Masonry Mortar Mix',
    slug: 'masonry-mortar-mix-demo',
    shortDescription:
      'Ready-to-use masonry mortar mix for bricklaying, blockwork, and general pointing.',
    longDescription:
      'Pre-blended masonry mortar designed for consistent strength and workability on site. Suitable for clay bricks, concrete blocks, and stonework. Mix with clean water only — no extra sand or cement required. Ideal for residential and light commercial projects in Portugal.',
    specifications:
      'Bag: 25kg | Type: General purpose masonry mortar | Class: M5 | EN 998-2 | Colour: Grey | Shelf life: 12 months dry storage | Coverage: ~0.5 m² per bag (10mm joint)',
    factoryName: 'Cimento do Tejo',
    basePrice: 6.1,
    b2bPrice: 5.2,
    minOrderQuantity: 20,
    minB2bQuantity: 100,
    unitOfMeasure: 'bags',
    weightKg: 25,
    marketplaceTier: 'WHOLESALE',
    approvalStatus: 'PENDING_REVIEW',
    warehouseLocation: 'Rua de Campolide 88, Lisbon, Portugal',
    averageRating: 4.4,
    reviewCount: 2,
  })
  await ensureProduct({
    sellerId: supplier.id,
    categoryId: category.id,
    sku: 'CEM-DEMO-003',
    title: 'Rejected Sample Binder',
    slug: 'rejected-sample-binder-demo',
    shortDescription: 'Sample listing rejected by admin.',
    longDescription: 'Not for sale.',
    specifications: 'N/A',
    basePrice: 4,
    minOrderQuantity: 1,
    unitOfMeasure: 'bags',
    weightKg: 25,
    marketplaceTier: 'RETAIL',
    approvalStatus: 'REJECTED',
    warehouseLocation: 'Rua de Campolide 88, Lisbon, Portugal',
    rejectionReason: 'Missing safety datasheet',
  })

  const factoryProduct = await ensureProduct({
    sellerId: factory.id,
    categoryId: category.id,
    sku: 'FAC-DEMO-001',
    title: 'Portland Cement Concrete',
    slug: 'portland-cement-concrete-demo',
    shortDescription: 'Factory bulk cement.',
    longDescription: 'Factory-direct CEM I for supplier restock.',
    specifications: '50kg | Palletized',
    factoryName: 'Cimento do Tejo',
    basePrice: 5.4,
    minOrderQuantity: 50,
    unitOfMeasure: 'bags',
    weightKg: 50,
    marketplaceTier: 'WHOLESALE',
    approvalStatus: 'APPROVED',
    warehouseLocation: 'Avenida Dom José I 45, Amadora, Portugal',
  })
  await ensureProduct({
    sellerId: factory.id,
    categoryId: category.id,
    sku: 'FAC-DEMO-002',
    title: 'White Cement Premium',
    slug: 'white-cement-premium-demo',
    shortDescription: 'Architectural white cement.',
    longDescription: 'White CEM I for finishes.',
    specifications: '25kg',
    factoryName: 'Cimento do Tejo',
    basePrice: 9.8,
    minOrderQuantity: 20,
    unitOfMeasure: 'bags',
    weightKg: 25,
    marketplaceTier: 'WHOLESALE',
    approvalStatus: 'PENDING_REVIEW',
    warehouseLocation: 'Avenida Dom José I 45, Amadora, Portugal',
  })

  await ensureMedia(supplierProduct.id, '/uploads/seed/cement-banner.jpg', [
    '/uploads/seed/cement-1.jpg',
  ])
  await ensureMedia(supplierPending.id, '/uploads/seed/mortar-banner.jpg', [
    '/uploads/seed/cement-1.jpg',
    '/uploads/seed/cement-banner.jpg',
  ])
  await ensureMedia(factoryProduct.id, '/uploads/seed/factory-cement.jpg')
  await ensureFeatures(supplierProduct.id, [
    'High early strength',
    'Smooth workability',
  ])
  await ensureFeatures(supplierPending.id, [
    'Pre-blended — consistent batch quality',
    'Good adhesion on brick and block',
    'Easy trowel workability',
    'Suitable for indoor and outdoor masonry',
  ])
  await ensureFeatures(factoryProduct.id, ['Bulk pallets', 'Factory sealed'])
  await ensureInventory(supplierProduct.id, 480)
  await ensureInventory(supplierPending.id, 120)
  await seedAdminFilterProducts(supplier.id)

  await prisma.pricingTier.deleteMany({ where: { productId: supplierProduct.id } })
  await prisma.pricingTier.createMany({
    data: [
      { productId: supplierProduct.id, minQuantity: 10, maxQuantity: 49, tierPrice: 8.5 },
      { productId: supplierProduct.id, minQuantity: 50, maxQuantity: null, tierPrice: 7.2 },
    ],
  })
  await prisma.pricingTier.deleteMany({ where: { productId: supplierPending.id } })
  await prisma.pricingTier.createMany({
    data: [
      { productId: supplierPending.id, minQuantity: 20, maxQuantity: 99, tierPrice: 6.1 },
      { productId: supplierPending.id, minQuantity: 100, maxQuantity: 499, tierPrice: 5.5 },
      { productId: supplierPending.id, minQuantity: 500, maxQuantity: null, tierPrice: 5.0 },
    ],
  })

  await prisma.productPromotion.deleteMany({
    where: {
      OR: [
        { productId: supplierProduct.id },
        { product: { sku: { startsWith: 'MKT-DEMO-' } } },
      ],
    },
  })

  const marketingSpecs = [
    {
      sku: 'MKT-DEMO-001',
      title: 'Sponsored Portland Cement',
      slug: 'mkt-sponsored-portland-demo',
      shortDescription: 'Featured cement for homepage carousel.',
      status: 'pending',
      plan: plan7,
    },
    {
      sku: 'MKT-DEMO-002',
      title: 'Bulk Aggregate Promo Pack',
      slug: 'mkt-bulk-aggregate-demo',
      shortDescription: 'Awaiting admin approve after payment.',
      status: 'pending',
      plan: plan15,
    },
    {
      sku: 'MKT-DEMO-003',
      title: 'Active Steel Mesh Bundle',
      slug: 'mkt-active-steel-mesh-demo',
      shortDescription: 'Currently live sponsored listing.',
      status: 'active',
      plan: plan30,
    },
    {
      sku: 'MKT-DEMO-004',
      title: 'Active Waterproofing Kit',
      slug: 'mkt-active-waterproof-demo',
      shortDescription: 'Sponsored for 15 days — still running.',
      status: 'active',
      plan: plan15,
    },
    {
      sku: 'MKT-DEMO-005',
      title: 'Completed Tile Adhesive Promo',
      slug: 'mkt-completed-tile-demo',
      shortDescription: 'Campaign finished — time ended.',
      status: 'completed',
      plan: plan7,
    },
    {
      sku: 'MKT-DEMO-006',
      title: 'Completed Scaffold Hire Promo',
      slug: 'mkt-completed-scaffold-demo',
      shortDescription: 'Expired sponsored campaign.',
      status: 'completed',
      plan: plan15,
    },
    {
      sku: 'MKT-DEMO-007',
      title: 'Rejected Paint Promo',
      slug: 'mkt-rejected-paint-demo',
      shortDescription: 'Paid but rejected by admin.',
      status: 'rejected',
      plan: plan7,
    },
    {
      sku: 'MKT-DEMO-008',
      title: 'Unpaid Draft Promo',
      slug: 'mkt-unpaid-draft-demo',
      shortDescription: 'Should NOT appear in Marketing Management.',
      status: 'unpaid',
      plan: plan7,
    },
  ]

  const now = new Date()
  for (let i = 0; i < marketingSpecs.length; i += 1) {
    const spec = marketingSpecs[i]
    const product = await ensureProduct({
      sellerId: supplier.id,
      categoryId: category.id,
      sku: spec.sku,
      title: spec.title,
      slug: spec.slug,
      shortDescription: spec.shortDescription,
      longDescription: `${spec.title} — marketing seed product.`,
      specifications: 'Demo marketing SKU',
      factoryName: 'Cimento do Tejo',
      basePrice: 10 + i,
      b2bPrice: 9 + i,
      minOrderQuantity: 5,
      unitOfMeasure: 'bags',
      weightKg: 25,
      marketplaceTier: 'RETAIL',
      approvalStatus: 'APPROVED',
      warehouseLocation: 'Rua de Campolide 88, Lisbon, Portugal',
      isFeatured: spec.status === 'active',
    })
    await ensureInventory(product.id, 200)
    await ensureMedia(product.id, `/uploads/seed/mkt-${i + 1}.jpg`)

    const isActive = spec.status === 'active'
    const isCompleted = spec.status === 'completed'
    const isPending = spec.status === 'pending'
    const isRejected = spec.status === 'rejected'
    const isUnpaid = spec.status === 'unpaid'

    let startDate = null
    let endDate = null
    if (isActive) {
      startDate = new Date(now.getTime() - 2 * 86400000)
      endDate = new Date(now.getTime() + spec.plan.durationDays * 86400000)
    } else if (isCompleted) {
      startDate = new Date(now.getTime() - (spec.plan.durationDays + 3) * 86400000)
      endDate = new Date(now.getTime() - 1 * 86400000)
    }

    await prisma.productPromotion.create({
      data: {
        productId: product.id,
        planId: spec.plan.id,
        amountPaid: spec.plan.price,
        durationDays: spec.plan.durationDays,
        paymentStatus: isUnpaid ? 'PENDING_PAYMENT' : 'PAID',
        paymentRef: isUnpaid ? null : `SEED-MKT-${spec.sku}`,
        approvalStatus: isUnpaid
          ? 'AWAITING_PAYMENT'
          : isPending
            ? 'PENDING_REVIEW'
            : isRejected
              ? 'REJECTED'
              : isCompleted
                ? 'EXPIRED'
                : 'APPROVED',
        startDate,
        endDate,
        paidAt: isUnpaid ? null : new Date(now.getTime() - 5 * 86400000),
        reviewedAt:
          isPending || isUnpaid ? null : new Date(now.getTime() - 3 * 86400000),
        rejectionReason: isRejected
          ? 'Creative does not match brand guidelines'
          : null,
      },
    })

    await prisma.product.update({
      where: { id: product.id },
      data: {
        isSponsored: isActive,
        isFeatured: isActive,
      },
    })
  }

  // Keep main demo product featured/active as well
  await prisma.productPromotion.create({
    data: {
      productId: supplierProduct.id,
      planId: plan30.id,
      amountPaid: 100,
      durationDays: 30,
      paymentStatus: 'PAID',
      paymentRef: 'SEED-MKT-CEM-DEMO-001',
      approvalStatus: 'APPROVED',
      startDate: now,
      endDate: new Date(now.getTime() + 30 * 86400000),
      paidAt: now,
      reviewedAt: now,
    },
  })
  await prisma.product.update({
    where: { id: supplierProduct.id },
    data: { isSponsored: true, isFeatured: true },
  })

  const promo = await prisma.promoCode.upsert({
    where: { code: 'DEMO10' },
    create: {
      sellerId: supplier.id,
      code: 'DEMO10',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderAmount: 50,
      usageLimit: 100,
      expiryDate: new Date('2027-12-31'),
      isActive: true,
      applicableUsers: 'ALL',
    },
    update: { sellerId: supplier.id, isActive: true },
  })

  const cart = await prisma.cart.upsert({
    where: { userId: customer.id },
    create: { userId: customer.id },
    update: {},
  })
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })
  await prisma.cartItem.create({
    data: { cartId: cart.id, productId: supplierProduct.id, quantity: 12 },
  })

  const vehicle = await prisma.vehicle.upsert({
    where: { licensePlate: 'AA-00-DEMO' },
    create: {
      transporterId: transporter.id,
      vehicleType: 'HEAVY_TRUCK',
      licensePlate: 'AA-00-DEMO',
      weightCapacityKg: 18000,
      volumeCapacityCubm: 40,
    },
    update: { transporterId: transporter.id },
  })

  const quote = await prisma.quoteRequest.upsert({
    where: { id: '00000000-0000-4000-8000-000000000011' },
    create: {
      id: '00000000-0000-4000-8000-000000000011',
      buyerId: company.id,
      sellerId: supplier.id,
      projectId: project.id,
      status: 'IN_CHAT',
      proposedBudget: 2500,
      message: 'Need 200 bags for Porto site next week.',
    },
    update: { status: 'IN_CHAT' },
  })
  await prisma.quoteItem.deleteMany({ where: { quoteRequestId: quote.id } })
  await prisma.quoteItem.create({
    data: {
      quoteRequestId: quote.id,
      productId: supplierProduct.id,
      quantity: 200,
      offeredUnitPrice: 7.5,
    },
  })
  const quoteThread = await prisma.chatThread.upsert({
    where: { quoteRequestId: quote.id },
    create: {
      type: 'QUOTE',
      quoteRequestId: quote.id,
    },
    update: {},
  })
  await prisma.chatThreadParticipant.deleteMany({ where: { threadId: quoteThread.id } })
  await prisma.chatThreadParticipant.createMany({
    data: [
      { threadId: quoteThread.id, userId: company.id },
      { threadId: quoteThread.id, userId: supplier.id },
    ],
  })
  await prisma.chatMessage.deleteMany({ where: { chatThreadId: quoteThread.id } })
  await prisma.chatMessage.create({
    data: {
      senderId: company.id,
      chatThreadId: quoteThread.id,
      quoteRequestId: quote.id,
      messageType: 'TEXT',
      messageText: 'Can you deliver to Porto by Friday?',
    },
  })
  await prisma.quoteOffer.deleteMany({ where: { quoteRequestId: quote.id } })
  await prisma.quoteOffer.create({
    data: {
      quoteRequestId: quote.id,
      chatThreadId: quoteThread.id,
      buyerId: company.id,
      createdById: supplier.id,
      productId: supplierProduct.id,
      warehouseLocation: 'Rua de Campolide 88, Lisbon',
      productName: supplierProduct.title,
      totalQuantity: 200,
      quantityUnit: 'bags',
      projectName: project.projectName,
      deliveryLocation: 'Porto Riverside Tower',
      unloadingType: 'forklift',
      accessConditions: 'street level',
      totalPrice: 1500,
      installmentMonths: 2,
      status: 'PENDING_RESPONSE',
      installments: {
        create: [
          { installmentNumber: 1, amount: 700, quantity: 90 },
          { installmentNumber: 2, amount: 800, quantity: 110 },
        ],
      },
    },
  })

  const factoryThread = await prisma.chatThread.upsert({
    where: { type_productId: { type: 'FACTORY_SUPPLIER', productId: factoryProduct.id } },
    create: {
      type: 'FACTORY_SUPPLIER',
      productId: factoryProduct.id,
    },
    update: {},
  })
  await prisma.chatThreadParticipant.deleteMany({ where: { threadId: factoryThread.id } })
  await prisma.chatThreadParticipant.createMany({
    data: [
      { threadId: factoryThread.id, userId: factory.id },
      { threadId: factoryThread.id, userId: supplier.id },
    ],
    skipDuplicates: true,
  })

  const erpPlain = 'erp_demo_supplier_key_construpreco'
  await prisma.supplierErpApiKey.updateMany({
    where: { supplierId: supplier.id, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  const erpHash = crypto.createHash('sha256').update(erpPlain).digest('hex')
  const erpExisting = await prisma.supplierErpApiKey.findUnique({
    where: { keyHash: erpHash },
  })
  if (!erpExisting) {
    await prisma.supplierErpApiKey.create({
      data: {
        supplierId: supplier.id,
        name: 'Demo ERP key',
        apiKey: erpPlain,
        keyHash: erpHash,
      },
    })
  }

  async function makeOrder({
    orderNumber,
    customerId,
    sellerId,
    shippingAddressId,
    billingAddressId,
    status,
    source,
    product,
    qty,
    shippingFee,
    projectId,
    affiliateId,
    extra = {},
  }) {
    const unit = product.basePrice
    const subTotal = unit * qty
    const vatAmount = Math.round(subTotal * 0.23 * 100) / 100
    const grandTotal = Math.round((subTotal + vatAmount + shippingFee) * 100) / 100
    const order = await ensureOrder({
      orderNumber,
      customerId,
      sellerId,
      shippingAddressId,
      billingAddressId,
      orderStatus: status,
      orderSource: source,
      subTotal,
      vatAmount,
      shippingFee,
      grandTotal,
      projectId,
      affiliateId,
      unloadingType: 'forklift',
      siteConditions: 'Wide gate',
      ...extra,
    })
    const lines = await prisma.orderLineItem.count({ where: { orderId: order.id } })
    if (!lines) {
      await prisma.orderLineItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          quantity: qty,
          unitPriceLocked: unit,
          totalPriceLocked: unit * qty,
          warehouseLocation: product.warehouseLocation,
        },
      })
    }
    const hist = await prisma.orderStatusHistory.count({ where: { orderId: order.id } })
    if (!hist) {
      await prisma.orderStatusHistory.create({
        data: { orderId: order.id, status, note: 'Demo seed' },
      })
    }
    await prisma.invoice.upsert({
      where: { orderId_audience: { orderId: order.id, audience: 'CUSTOMER' } },
      create: {
        orderId: order.id,
        audience: 'CUSTOMER',
        invoiceNumber: invoiceNumber(orderNumber, { audience: 'CUSTOMER' }),
      },
      update: {},
    })
    await prisma.invoice.upsert({
      where: { orderId_audience: { orderId: order.id, audience: 'SUPPLIER' } },
      create: {
        orderId: order.id,
        audience: 'SUPPLIER',
        invoiceNumber: invoiceNumber(orderNumber, { audience: 'SUPPLIER' }),
      },
      update: {},
    })
    return order
  }

  const custOrder = await makeOrder({
    orderNumber: 'ORD-DEMO-CUST-001',
    customerId: customer.id,
    sellerId: supplier.id,
    shippingAddressId: customerShip.id,
    billingAddressId: customerShip.id,
    status: 'PENDING',
    source: 'DIRECT_CART',
    product: supplierProduct,
    qty: 15,
    shippingFee: 20,
  })

  const coNew = await makeOrder({
    orderNumber: 'ORD-DEMO-CO-001',
    customerId: company.id,
    sellerId: supplier.id,
    shippingAddressId: companyShip.id,
    billingAddressId: companyShip.id,
    status: 'PROCESSING',
    source: 'DIRECT_CART',
    product: supplierProduct,
    qty: 40,
    shippingFee: 35,
    projectId: project.id,
  })

  const coAssigned = await makeOrder({
    orderNumber: 'ORD-DEMO-CO-002',
    customerId: company.id,
    sellerId: supplier.id,
    shippingAddressId: companyShip.id,
    billingAddressId: companyShip.id,
    status: 'ASSIGNED',
    source: 'DIRECT_CART',
    product: supplierProduct,
    qty: 25,
    shippingFee: 28,
    projectId: project.id,
    affiliateId: affiliate.id,
  })

  const facReady = await makeOrder({
    orderNumber: 'ORD-DEMO-FAC-001',
    customerId: supplier.id,
    sellerId: factory.id,
    shippingAddressId: supplierWh.id,
    billingAddressId: supplierWh.id,
    status: 'READY',
    source: 'FACTORY_CONVERSION',
    product: factoryProduct,
    qty: 80,
    shippingFee: 0,
  })

  const facPay = await makeOrder({
    orderNumber: 'ORD-DEMO-FAC-002',
    customerId: supplier.id,
    sellerId: factory.id,
    shippingAddressId: supplierWh.id,
    billingAddressId: supplierWh.id,
    status: 'READY',
    source: 'FACTORY_CONVERSION',
    product: factoryProduct,
    qty: 60,
    shippingFee: 0,
  })

  const facAssigned = await makeOrder({
    orderNumber: 'ORD-DEMO-FAC-003',
    customerId: supplier.id,
    sellerId: factory.id,
    shippingAddressId: supplierWh.id,
    billingAddressId: supplierWh.id,
    status: 'ASSIGNED',
    source: 'FACTORY_CONVERSION',
    product: factoryProduct,
    qty: 100,
    shippingFee: 0,
  })

  await prisma.commissionTransaction.upsert({
    where: { orderId: coAssigned.id },
    create: {
      affiliateId: affiliate.id,
      orderId: coAssigned.id,
      saleAmount: coAssigned.grandTotal,
      commissionAmount: 18.5,
      status: 'PENDING',
    },
    update: {},
  })

  await seedAffiliateDirectory({
    primaryAffiliate: affiliate,
    customer,
    company,
    supplier,
    supplierProduct,
    customerShip,
    makeOrder,
  })

  await prisma.review.deleteMany({
    where: { authorId: customer.id, productId: supplierProduct.id },
  })
  await prisma.review.create({
    data: {
      authorId: customer.id,
      productId: supplierProduct.id,
      rating: 5,
      comment: 'Arrived on time, good quality.',
    },
  })
  await prisma.review.deleteMany({ where: { productId: supplierPending.id } })
  await prisma.review.createMany({
    data: [
      {
        authorId: customer.id,
        productId: supplierPending.id,
        rating: 5,
        comment: 'Smooth mix and strong joints. Delivered on time.',
      },
      {
        authorId: customer.id,
        productId: supplierPending.id,
        rating: 4,
        comment: 'Good value for blockwork. Bags arrived sealed and dry.',
      },
    ],
  })

  let auctionSeq = 0
  async function ensureAuction({
    order,
    pickup,
    delivery,
    distanceKm,
    isFactoryOrder,
    bidStartPrice,
    status,
    expiresInMin,
    acceptBid,
    withBid = true,
    requiredVehicleType = 'HEAVY_TRUCK',
  }) {
    const shipment = await prisma.shipment.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        vehicleId: status === 'ASSIGNED' ? vehicle.id : null,
        pickupAddressText: pickup,
        deliveryAddressText: delivery,
        distanceKm,
      },
      update: {
        pickupAddressText: pickup,
        deliveryAddressText: delivery,
        distanceKm,
        vehicleId: status === 'ASSIGNED' ? vehicle.id : undefined,
      },
    })
    const expiresAt = new Date(Date.now() + expiresInMin * 60 * 1000)
    const existingAuction = await prisma.shipmentAuction.findUnique({
      where: { shipmentId: shipment.id },
      select: { id: true, auctionCode: true },
    })
    let auctionCode = existingAuction?.auctionCode || null
    if (!auctionCode) {
      while (!auctionCode) {
        auctionSeq += 1
        const candidate = formatAuctionCode(auctionSeq)
        const taken = await prisma.shipmentAuction.findUnique({
          where: { auctionCode: candidate },
          select: { id: true },
        })
        if (!taken) auctionCode = candidate
      }
    }
    const auction = await prisma.shipmentAuction.upsert({
      where: { shipmentId: shipment.id },
      create: {
        shipmentId: shipment.id,
        auctionCode,
        requiredVehicleType,
        auctionStatus: status,
        isFactoryOrder,
        bidStartPrice,
        expiresAt,
      },
      update: {
        auctionStatus: status,
        isFactoryOrder,
        bidStartPrice,
        expiresAt,
        requiredVehicleType,
        auctionCode,
      },
    })
    await prisma.transporterBid.deleteMany({ where: { auctionId: auction.id } })
    if (withBid) {
      await prisma.transporterBid.create({
        data: {
          auctionId: auction.id,
          transporterId: transporter.id,
          bidAmount: Math.max(1, (bidStartPrice || 20) - 3),
          estimatedDeliveryTime: '',
          status: acceptBid ? 'ACCEPTED' : 'SUBMITTED',
        },
      })
    }
    return auction
  }

  await ensureAuction({
    order: coAssigned,
    pickup: 'Rua de Campolide 88, Lisbon, Portugal',
    delivery: 'Rua de Santa Catarina 200, Porto, Portugal',
    distanceKm: 313,
    isFactoryOrder: false,
    bidStartPrice: 28,
    status: 'ASSIGNED',
    expiresInMin: -10,
    acceptBid: true,
  })

  await ensureAuction({
    order: facReady,
    pickup: 'Avenida Dom José I 45, Amadora, Portugal',
    delivery: 'Rua de Campolide 88, Lisbon, Portugal',
    distanceKm: 12.4,
    isFactoryOrder: true,
    bidStartPrice: 31,
    status: 'PENDING_BIDS',
    expiresInMin: 20,
    acceptBid: false,
  })

  await ensureAuction({
    order: facPay,
    pickup: 'Avenida Dom José I 45, Amadora, Portugal',
    delivery: 'Rua de Campolide 88, Lisbon, Portugal',
    distanceKm: 12.4,
    isFactoryOrder: true,
    bidStartPrice: 31,
    status: 'PENDING_PAYMENT',
    expiresInMin: -2,
    acceptBid: true,
  })

  await ensureAuction({
    order: facAssigned,
    pickup: 'Avenida Dom José I 45, Amadora, Portugal',
    delivery: 'Rua de Campolide 88, Lisbon, Portugal',
    distanceKm: 12.4,
    isFactoryOrder: true,
    bidStartPrice: 31,
    status: 'ASSIGNED',
    expiresInMin: -15,
    acceptBid: true,
  })

  const doneCement = await makeOrder({
    orderNumber: 'ORD-DEMO-TR-DONE-001',
    customerId: company.id,
    sellerId: supplier.id,
    shippingAddressId: companyShip.id,
    billingAddressId: companyShip.id,
    status: 'COMPLETED',
    source: 'DIRECT_CART',
    product: supplierProduct,
    qty: 30,
    shippingFee: 21,
    projectId: project.id,
  })
  const doneFactory = await makeOrder({
    orderNumber: 'ORD-DEMO-TR-DONE-002',
    customerId: supplier.id,
    sellerId: factory.id,
    shippingAddressId: supplierWh.id,
    billingAddressId: supplierWh.id,
    status: 'COMPLETED',
    source: 'FACTORY_CONVERSION',
    product: factoryProduct,
    qty: 40,
    shippingFee: 0,
  })

  async function seedCompletedJob({
    order,
    pickup,
    delivery,
    distanceKm,
    bidStartPrice,
    isFactoryOrder,
    pickedAt,
  }) {
    await prisma.order.update({
      where: { id: order.id },
      data: { orderStatus: 'COMPLETED' },
    })
    const auction = await ensureAuction({
      order,
      pickup,
      delivery,
      distanceKm,
      isFactoryOrder,
      bidStartPrice,
      status: 'ASSIGNED',
      expiresInMin: -90,
      acceptBid: true,
    })
    await prisma.trackingEvent.deleteMany({
      where: { shipmentId: auction.shipmentId },
    })
    await prisma.trackingEvent.createMany({
      data: [
        { shipmentId: auction.shipmentId, statusText: 'Assigned' },
        {
          shipmentId: auction.shipmentId,
          statusText: 'Picked Up',
          timestamp: pickedAt,
        },
        { shipmentId: auction.shipmentId, statusText: 'In Transit' },
        { shipmentId: auction.shipmentId, statusText: 'Delivered' },
      ],
    })
  }

  await seedCompletedJob({
    order: doneCement,
    pickup: 'Brick Kiln Industries, Vasai East, Palghar 401208',
    delivery: 'Villa Paradise Construction, Mira Road, Thane 401107',
    distanceKm: 21,
    bidStartPrice: 180,
    isFactoryOrder: false,
    pickedAt: new Date('2026-08-20T08:15:00.000Z'),
  })
  await seedCompletedJob({
    order: doneFactory,
    pickup: 'UltraMix Concrete Plant, Ghodbunder Road, Thane 400607',
    delivery: 'Sunrise Tower Project, Pokhran Road, Thane 400606',
    distanceKm: 12,
    bidStartPrice: 78,
    isFactoryOrder: true,
    pickedAt: new Date('2026-08-21T09:40:00.000Z'),
  })

  // 10 open auctions for transporter board (PENDING_BIDS, not expired, no bid yet)
  const openAuctionRoutes = [
    {
      pickup: 'Rua de Campolide 88, Lisbon, Portugal',
      delivery: 'Rua de Santa Catarina 200, Porto, Portugal',
      distanceKm: 313,
      bidStartPrice: 95,
      vehicle: 'HEAVY_TRUCK',
      factory: false,
      buyer: 'company',
      expiresInMin: 180,
    },
    {
      pickup: 'Avenida Dom José I 45, Amadora, Portugal',
      delivery: 'Rua Augusta 150, Lisbon, Portugal',
      distanceKm: 14.2,
      bidStartPrice: 28,
      vehicle: 'VAN',
      factory: true,
      buyer: 'supplier',
      expiresInMin: 45,
    },
    {
      pickup: 'Rua de Campolide 88, Lisbon, Portugal',
      delivery: 'Avenida da Liberdade 100, Lisbon, Portugal',
      distanceKm: 4.8,
      bidStartPrice: 18,
      vehicle: 'FLATBED',
      factory: false,
      buyer: 'customer',
      expiresInMin: 90,
    },
    {
      pickup: 'Zona Industrial de Alverca, Vila Franca de Xira, Portugal',
      delivery: 'Rua de Santa Catarina 200, Porto, Portugal',
      distanceKm: 295,
      bidStartPrice: 110,
      vehicle: 'TIPPER',
      factory: false,
      buyer: 'company',
      expiresInMin: 240,
    },
    {
      pickup: 'Avenida Dom José I 45, Amadora, Portugal',
      delivery: 'Praça da República, Coimbra, Portugal',
      distanceKm: 198,
      bidStartPrice: 72,
      vehicle: 'HEAVY_TRUCK',
      factory: true,
      buyer: 'supplier',
      expiresInMin: 120,
    },
    {
      pickup: 'Rua de Campolide 88, Lisbon, Portugal',
      delivery: 'Faro Airport Industrial Park, Faro, Portugal',
      distanceKm: 278,
      bidStartPrice: 130,
      vehicle: 'CRANE_TRUCK',
      factory: false,
      buyer: 'company',
      expiresInMin: 300,
    },
    {
      pickup: 'Porto Logistics Hub, Matosinhos, Portugal',
      delivery: 'Rua Augusta 150, Lisbon, Portugal',
      distanceKm: 305,
      bidStartPrice: 88,
      vehicle: 'HEAVY_TRUCK',
      factory: false,
      buyer: 'customer',
      expiresInMin: 60,
    },
    {
      pickup: 'Avenida Dom José I 45, Amadora, Portugal',
      delivery: 'Braga Parque, Braga, Portugal',
      distanceKm: 365,
      bidStartPrice: 145,
      vehicle: 'FLATBED',
      factory: true,
      buyer: 'supplier',
      expiresInMin: 150,
    },
    {
      pickup: 'Rua de Campolide 88, Lisbon, Portugal',
      delivery: 'Évora Centro, Évora, Portugal',
      distanceKm: 132,
      bidStartPrice: 55,
      vehicle: 'TIPPER',
      factory: false,
      buyer: 'company',
      expiresInMin: 75,
    },
    {
      pickup: 'Setúbal Port Terminal, Setúbal, Portugal',
      delivery: 'Rua de Campolide 88, Lisbon, Portugal',
      distanceKm: 48,
      bidStartPrice: 35,
      vehicle: 'VAN',
      factory: false,
      buyer: 'customer',
      expiresInMin: 35,
    },
  ]

  for (let i = 0; i < openAuctionRoutes.length; i += 1) {
    const route = openAuctionRoutes[i]
    const n = String(i + 1).padStart(2, '0')
    let customerId = company.id
    let shippingAddressId = companyShip.id
    let sellerId = supplier.id
    let product = supplierProduct
    let source = 'DIRECT_CART'
    let status = 'PROCESSING'
    let projectId

    if (route.buyer === 'customer') {
      customerId = customer.id
      shippingAddressId = customerShip.id
    } else if (route.buyer === 'supplier') {
      customerId = supplier.id
      shippingAddressId = supplierWh.id
      sellerId = factory.id
      product = factoryProduct
      source = 'FACTORY_CONVERSION'
      status = 'READY'
    } else {
      projectId = project.id
    }

    const openOrder = await makeOrder({
      orderNumber: `ORD-DEMO-TX-OPEN-${n}`,
      customerId,
      sellerId,
      shippingAddressId,
      billingAddressId: shippingAddressId,
      status,
      source,
      product,
      qty: 20 + i * 5,
      shippingFee: route.bidStartPrice,
      projectId,
    })

    await ensureAuction({
      order: openOrder,
      pickup: route.pickup,
      delivery: route.delivery,
      distanceKm: route.distanceKm,
      isFactoryOrder: route.factory,
      bidStartPrice: route.bidStartPrice,
      status: 'PENDING_BIDS',
      expiresInMin: route.expiresInMin,
      withBid: false,
      requiredVehicleType: route.vehicle,
    })
  }

  const ticket = await prisma.supportTicket.findFirst({
    where: { userId: customer.id, subject: 'Demo delivery question' },
  })
  if (!ticket) {
    const created = await prisma.supportTicket.create({
      data: {
        userId: customer.id,
        subject: 'Demo delivery question',
        status: 'OPEN',
      },
    })
    await prisma.ticketMessage.create({
      data: {
        ticketId: created.id,
        senderId: customer.id,
        messageText: 'When will my order arrive?',
      },
    })
    await prisma.ticketMessage.create({
      data: {
        ticketId: created.id,
        senderId: admin.id,
        messageText: 'We assigned a transporter. You will get an OTP at delivery.',
      },
    })
  }

  await prisma.affiliateLink.upsert({
    where: { trackingCode: 'DEMO-AFF-HOME' },
    create: {
      affiliateId: affiliate.id,
      campaignName: 'PRIMARY CHANNEL',
      targetUrl: 'http://localhost:5173/ref?code=ALEXRIVERS15',
      trackingCode: 'DEMO-AFF-HOME',
      totalClicks: 42,
      totalConversions: 1,
    },
    update: {
      campaignName: 'PRIMARY CHANNEL',
      targetUrl: 'http://localhost:5173/ref?code=ALEXRIVERS15',
    },
  })

  console.log('\nDemo seed complete.\n')
  console.log('Logins (password Password123!):')
  console.log('  customer@test.local')
  console.log('  company@test.local')
  console.log('  supplier@test.local')
  console.log('  factory@test.local')
  console.log('  transporter@test.local')
  console.log('  affiliate@test.local')
  console.log(`  ${ADMIN_EMAIL}  (password: ${ADMIN_PASSWORD})`)
  console.log('\nERP key: erp_demo_supplier_key_construpreco')
  console.log('Promo: DEMO10')
  console.log('Affiliate referral code: ALEXRIVERS15')
  console.log('Extra affiliates: sarah.corp / build.partners / mason.referrals / cement.connect / priya.nair / northstar @test.local')
  console.log('Orders: ORD-DEMO-CUST-001, ORD-DEMO-CO-001/002, ORD-DEMO-FAC-001/002/003')
  console.log('Open transporter auctions: ORD-DEMO-TX-OPEN-01 … 10')
  console.log('Marketing: MKT-DEMO-001…008 (pending/active/completed/rejected + unpaid hidden)')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
