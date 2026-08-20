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
import { invoiceNumber } from '../shared/numbering.js'

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

async function ensureUser({ email, password, name, role, phone }) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name,
        role,
        status: 'ACTIVE',
        emailVerified: true,
        phoneNumber: phone,
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
      status: 'ACTIVE',
      emailVerified: true,
      phoneNumber: phone,
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

async function main() {
  const category = await leafCategory()

  await prisma.promotionPlan.upsert({
    where: { durationDays: 7 },
    create: { label: 'For 7 days', durationDays: 7, price: 40, sortOrder: 1 },
    update: {},
  })
  await prisma.promotionPlan.upsert({
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
    name: 'Pedro Affiliates',
    role: 'AFFILIATE',
    phone: '912000006',
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
    data: { referralCode: affiliate.referralCode || 'AFF-DEMO-1' },
  })

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
    companyName: 'Pedro Affiliates',
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
  await ensureWallet(transporter.id, 210, 45)
  await ensureWallet(affiliate.id, 95, 12)

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
    shortDescription: 'Ready mortar mix.',
    longDescription: 'Pre-blended masonry mortar.',
    specifications: '25kg bags',
    basePrice: 6.1,
    minOrderQuantity: 20,
    unitOfMeasure: 'bags',
    weightKg: 25,
    marketplaceTier: 'WHOLESALE',
    approvalStatus: 'PENDING_REVIEW',
    warehouseLocation: 'Rua de Campolide 88, Lisbon, Portugal',
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
  await ensureMedia(supplierPending.id, '/uploads/seed/mortar-banner.jpg')
  await ensureMedia(factoryProduct.id, '/uploads/seed/factory-cement.jpg')
  await ensureFeatures(supplierProduct.id, [
    'High early strength',
    'Smooth workability',
  ])
  await ensureFeatures(factoryProduct.id, ['Bulk pallets', 'Factory sealed'])
  await ensureInventory(supplierProduct.id, 480)
  await ensureInventory(supplierPending.id, 120)

  await prisma.pricingTier.deleteMany({ where: { productId: supplierProduct.id } })
  await prisma.pricingTier.createMany({
    data: [
      { productId: supplierProduct.id, minQuantity: 10, maxQuantity: 49, tierPrice: 8.5 },
      { productId: supplierProduct.id, minQuantity: 50, maxQuantity: null, tierPrice: 7.2 },
    ],
  })

  await prisma.productPromotion.deleteMany({
    where: { productId: supplierProduct.id },
  })
  await prisma.productPromotion.create({
    data: {
      productId: supplierProduct.id,
      planId: plan30.id,
      amountPaid: 100,
      durationDays: 30,
      paymentStatus: 'PAID',
      approvalStatus: 'APPROVED',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 86400000),
      paidAt: new Date(),
      reviewedAt: new Date(),
    },
  })
  await prisma.product.update({
    where: { id: supplierProduct.id },
    data: { isSponsored: true },
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
    const auction = await prisma.shipmentAuction.upsert({
      where: { shipmentId: shipment.id },
      create: {
        shipmentId: shipment.id,
        requiredVehicleType: 'HEAVY_TRUCK',
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
      },
    })
    await prisma.transporterBid.deleteMany({ where: { auctionId: auction.id } })
    await prisma.transporterBid.create({
      data: {
        auctionId: auction.id,
        transporterId: transporter.id,
        bidAmount: Math.max(1, (bidStartPrice || 20) - 3),
        estimatedDeliveryTime: '',
        status: acceptBid ? 'ACCEPTED' : 'SUBMITTED',
      },
    })
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
      campaignName: 'Homepage cement',
      targetUrl: 'https://construpreco.local/products/portland-cement-quick-set-demo',
      trackingCode: 'DEMO-AFF-HOME',
      totalClicks: 42,
      totalConversions: 1,
    },
    update: {},
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
  console.log('Orders: ORD-DEMO-CUST-001, ORD-DEMO-CO-001/002, ORD-DEMO-FAC-001/002/003')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
