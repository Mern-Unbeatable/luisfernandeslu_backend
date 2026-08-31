/**
 * Ensure 50 live marketplace products, of which exactly 8 are featured/sponsored.
 *
 *   npm exec -- tsx src/scripts/seed-marketplace-50.js
 */
import 'dotenv/config'
import prisma from '../../lib/prisma.js'
import {
  SEED_PRODUCT_IMAGES,
  resolveSeedMediaUrl,
} from './seed-product-images.js'

const TARGET_LIVE = 50
const FEATURED_COUNT = 8
const SKU_PREFIX = 'LIVE-DEMO-'

const TITLES = [
  'Portland Cement Quick Set',
  'Reinforcing Steel Mesh',
  'Waterproofing Membrane Kit',
  'Insulation Foam Board',
  'Drywall Sheet Bundle',
  'Roof Underlay Membrane',
  'Concrete Additive Mix',
  'Structural Rebar Pack',
  'Clay Brick Pallet',
  'Concrete Block Set',
  'PVC Drainage Pipe',
  'Electrical Cable Coil',
  'Exterior Wall Paint',
  'Tile Adhesive Bag',
  'Sand & Aggregate Mix',
  'Timber Formwork Plank',
  'Safety Scaffold Coupler',
  'Glass Fiber Mesh',
  'Epoxy Floor Coating',
  'Aluminum Window Frame',
  'Ceramic Floor Tile',
  'Gypsum Plaster Bag',
  'Bitumen Roof Sealant',
  'Steel Angle Bar',
  'Plumbing Elbow Kit',
  'LED Site Floodlight',
  'Masonry Mortar Mix',
  'Stone Aggregate 20mm',
  'White Cement Finish',
  'Plywood Sheet 18mm',
  'Concrete Curing Compound',
  'Expansion Joint Filler',
  'Thermal Rockwool Slab',
  'Drainage Geotextile',
  'Fastener Screw Pack',
  'Silicone Sealant Tube',
  'Brick Veneer Panel',
  'Metal Roofing Sheet',
  'Floor Screed Mix',
  'Acoustic Wall Panel',
  'Plastic Water Tank',
  'Site Wheelbarrow',
  'Cement Mixer Blade',
  'Gravel Base Course',
  'Lime Putty Bucket',
  'Fiber Cement Board',
  'Concrete Form Oil',
  'Anchor Bolt Set',
  'Wall Primer Coat',
  'Ready-Mix Additive',
]

const IMAGE_KEYS = Object.keys(SEED_PRODUCT_IMAGES)

function skuFor(index) {
  return `${SKU_PREFIX}${String(index + 1).padStart(3, '0')}`
}

function slugFor(index, title) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `live-demo-${String(index + 1).padStart(3, '0')}-${base}`
}

async function marketplaceLeafPool() {
  const roots = await prisma.category.findMany({
    where: { parentCategoryId: null },
    orderBy: { slug: 'asc' },
    select: { id: true },
  })

  const pool = []
  for (const root of roots) {
    const subs = await prisma.category.findMany({
      where: { parentCategoryId: root.id },
      orderBy: { slug: 'asc' },
      select: { id: true },
    })

    for (const sub of subs) {
      const leaf = await prisma.category.findFirst({
        where: { parentCategoryId: sub.id },
        orderBy: { name: 'asc' },
        select: { id: true },
      })
      if (leaf) pool.push(leaf)
    }
  }

  if (!pool.length) {
    throw new Error('Catalog is empty. Run: npm run seed:catalog')
  }

  return pool
}

async function ensureMedia(productId, imageKey, extraImageKey = null) {
  await prisma.productMedia.deleteMany({ where: { productId } })
  await prisma.productMedia.create({
    data: {
      productId,
      mediaUrl: resolveSeedMediaUrl(imageKey),
      isBanner: true,
      sortOrder: 0,
    },
  })
  if (extraImageKey) {
    await prisma.productMedia.create({
      data: {
        productId,
        mediaUrl: resolveSeedMediaUrl(extraImageKey),
        isBanner: false,
        sortOrder: 1,
      },
    })
  }
}

async function ensureFeatures(productId, title) {
  const texts = [
    `${title} meets marketplace quality checks`,
    'Suitable for professional construction sites',
    'Consistent batch quality from verified supplier',
    'Fast dispatch from Lisbon warehouse',
  ]
  await prisma.productFeature.deleteMany({ where: { productId } })
  await prisma.productFeature.createMany({
    data: texts.map((featureText) => ({ productId, featureText })),
  })
}

async function ensurePricingTiers(productId, basePrice, b2bPrice) {
  await prisma.pricingTier.deleteMany({ where: { productId } })
  const retailMid = Number((basePrice * 0.97).toFixed(2))
  await prisma.pricingTier.createMany({
    data: [
      {
        productId,
        minQuantity: 1,
        maxQuantity: 19,
        tierPrice: basePrice,
      },
      {
        productId,
        minQuantity: 20,
        maxQuantity: 99,
        tierPrice: retailMid >= b2bPrice ? retailMid : basePrice,
      },
      {
        productId,
        minQuantity: 100,
        maxQuantity: 499,
        tierPrice: Number(Math.max(b2bPrice - 0.5, 1).toFixed(2)),
      },
      {
        productId,
        minQuantity: 500,
        maxQuantity: null,
        tierPrice: Number(Math.max(b2bPrice - 1, 1).toFixed(2)),
      },
    ],
  })
}

const REVIEW_COMMENTS = [
  'Arrived on time and matched the listing.',
  'Good quality for site work.',
  'Reliable supplier, would order again.',
  'Packaging was intact and easy to handle.',
]

async function ensureReviews(productId, authorId, reviewCount, baseRating) {
  await prisma.review.deleteMany({ where: { productId } })
  if (!reviewCount || !authorId) return

  await prisma.review.createMany({
    data: Array.from({ length: reviewCount }, (_, index) => ({
      authorId,
      productId,
      rating: Math.min(5, Math.max(4, Math.round(baseRating) - (index % 2))),
      comment: REVIEW_COMMENTS[index % REVIEW_COMMENTS.length],
      createdAt: new Date(Date.now() - (index + 1) * 7 * 86400000),
    })),
  })
}

async function ensureInventory(productId) {
  await prisma.inventory.upsert({
    where: { productId },
    create: {
      productId,
      currentStock: 500,
      listedQuantity: 400,
      lowStockThreshold: 20,
    },
    update: {
      currentStock: 500,
      listedQuantity: 400,
      lowStockThreshold: 20,
    },
  })
}

async function main() {
  const supplier = await prisma.user.findFirst({
    where: { email: 'supplier@test.local' },
  })
  if (!supplier) {
    throw new Error('supplier@test.local missing — run seed:demo first')
  }

  const reviewAuthor = await prisma.user.findFirst({
    where: { email: 'customer@test.local' },
    select: { id: true },
  })

  const leafPool = await marketplaceLeafPool()
  const plans = await prisma.promotionPlan.findMany({
    orderBy: { durationDays: 'asc' },
  })
  const plan15 = plans.find((p) => p.durationDays === 15) || plans[0]
  const plan30 = plans.find((p) => p.durationDays === 30) || plans[0]
  if (!plan15) {
    throw new Error('No promotion plans — run seed:promotion-plans')
  }

  const now = new Date()
  const liveIds = []

  for (let i = 0; i < TARGET_LIVE; i += 1) {
    const sku = skuFor(i)
    const title = TITLES[i] || `Construction Supply ${i + 1}`
    const featured = i < FEATURED_COUNT
    const basePrice = Number((8 + (i % 20) * 0.75).toFixed(2))
    const b2bPrice = Number((basePrice - 1.2).toFixed(2))

    const leaf = leafPool[i % leafPool.length]

    const data = {
      sellerId: supplier.id,
      categoryId: leaf.id,
      sku,
      title,
      slug: slugFor(i, title),
      shortDescription: `${title} — marketplace demo listing ${i + 1}/${TARGET_LIVE}.`,
      longDescription: `${title} seeded for homepage / catalog demos.`,
      specifications: '25–50kg | Demo SKU',
      factoryName: 'Cimento do Tejo',
      basePrice,
      b2bPrice,
      minOrderQuantity: featured && i === 0 ? 10 : 5,
      minB2bQuantity: 20,
      unitOfMeasure: 'bags',
      weightKg: i === 0 ? 50 : 25,
      marketplaceTier: 'RETAIL',
      approvalStatus: 'APPROVED',
      rejectionReason: null,
      warehouseLocation: 'Rua de Campolide 88, Lisbon, Portugal',
      isSponsored: featured,
      isFeatured: featured,
      averageRating: i === 0 ? 4.6 : i < 5 ? 4.1 : 0,
      reviewCount: i === 0 ? 12 : i < 5 ? 3 : 0,
    }

    const existing = await prisma.product.findUnique({ where: { sku } })
    const product = existing
      ? await prisma.product.update({ where: { id: existing.id }, data })
      : await prisma.product.create({ data })

    const imageKey = IMAGE_KEYS[i % IMAGE_KEYS.length]
    const extraImageKey = IMAGE_KEYS[(i + 3) % IMAGE_KEYS.length]
    const reviewCount = i === 0 ? 12 : i < 5 ? 3 : 0
    const averageRating = i === 0 ? 4.6 : i < 5 ? 4.1 : 0

    await ensureInventory(product.id)
    await ensureMedia(product.id, imageKey, extraImageKey)
    await ensureFeatures(product.id, title)
    await ensurePricingTiers(product.id, basePrice, b2bPrice)
    await ensureReviews(
      product.id,
      reviewAuthor?.id,
      reviewCount,
      averageRating,
    )
    liveIds.push(product.id)
  }

  // Exactly 8 featured/sponsored globally among LIVE-DEMO set;
  // clear flags on every other product so homepage slots stay at 8.
  await prisma.product.updateMany({
    where: { id: { notIn: liveIds.slice(0, FEATURED_COUNT) } },
    data: { isSponsored: false, isFeatured: false },
  })
  await prisma.product.updateMany({
    where: { id: { in: liveIds.slice(0, FEATURED_COUNT) } },
    data: { isSponsored: true, isFeatured: true },
  })

  // Keep marketplace live catalog at exactly these 50 SKUs
  // (unlist any other APPROVED products that were already listed).
  const otherLive = await prisma.product.findMany({
    where: {
      id: { notIn: liveIds },
      approvalStatus: 'APPROVED',
      inventory: { listedQuantity: { gt: 0 } },
    },
    select: { id: true },
  })
  if (otherLive.length) {
    await prisma.inventory.updateMany({
      where: { productId: { in: otherLive.map((p) => p.id) } },
      data: { listedQuantity: 0 },
    })
  }

  // Refresh active promotions for the 8 featured products
  await prisma.productPromotion.deleteMany({
    where: { productId: { in: liveIds.slice(0, FEATURED_COUNT) } },
  })
  for (let i = 0; i < FEATURED_COUNT; i += 1) {
    const plan = i % 2 === 0 ? plan30 : plan15
    await prisma.productPromotion.create({
      data: {
        productId: liveIds[i],
        planId: plan.id,
        amountPaid: plan.price,
        durationDays: plan.durationDays,
        paymentStatus: 'PAID',
        paymentRef: `SEED-LIVE-FEAT-${skuFor(i)}`,
        approvalStatus: 'APPROVED',
        startDate: new Date(now.getTime() - 2 * 86400000),
        endDate: new Date(now.getTime() + plan.durationDays * 86400000),
        paidAt: new Date(now.getTime() - 5 * 86400000),
        reviewedAt: new Date(now.getTime() - 3 * 86400000),
      },
    })
  }

  const total = await prisma.product.count()
  const live = await prisma.product.count({
    where: {
      approvalStatus: 'APPROVED',
      inventory: { listedQuantity: { gt: 0 } },
    },
  })
  const featured = await prisma.product.count({ where: { isFeatured: true } })
  const sponsored = await prisma.product.count({ where: { isSponsored: true } })
  const liveDemo = await prisma.product.count({
    where: { sku: { startsWith: SKU_PREFIX } },
  })

  console.log(
    JSON.stringify(
      {
        message: `Seeded ${TARGET_LIVE} live marketplace products (${FEATURED_COUNT} featured/sponsored)`,
        liveDemoSkus: liveDemo,
        featured,
        sponsored,
        liveMarketplace: live,
        totalProductsInDb: total,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
