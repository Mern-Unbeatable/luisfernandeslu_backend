/**
 * Fix broken /uploads/seed images and fill all 8 sponsored homepage slots
 * without running the full demo seed.
 *
 *   pnpm exec tsx src/scripts/seed-sponsored-slots.js
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import prisma from '../../lib/prisma.js'
import { resolveSeedMediaUrl } from './seed-product-images.js'

const SPONSORED_SLOT_COUNT = 8
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads')
const SEED_DIR = path.join(UPLOAD_ROOT, 'seed')

function ensureSeedImageFiles() {
  fs.mkdirSync(SEED_DIR, { recursive: true })
  const sources = []
  for (const root of [
    path.join(UPLOAD_ROOT, 'products'),
    path.join(UPLOAD_ROOT, 'disputes'),
  ]) {
    if (!fs.existsSync(root)) continue
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.(jpe?g|png|webp)$/i.test(entry.name)) sources.push(full)
      }
    }
    walk(root)
  }
  const tinyJpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
    'base64',
  )
  const names = [
    'cement-banner.jpg',
    'cement-1.jpg',
    'mortar-banner.jpg',
    'factory-cement.jpg',
    ...Array.from({ length: 16 }, (_, i) => `mkt-${i + 1}.jpg`),
  ]
  for (let i = 0; i < names.length; i += 1) {
    const dest = path.join(SEED_DIR, names[i])
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100) continue
    const src = sources[i % Math.max(sources.length, 1)]
    if (src && fs.existsSync(src)) fs.copyFileSync(src, dest)
    else fs.writeFileSync(dest, tinyJpeg)
  }
  console.log(`Seed images ready in ${SEED_DIR} (${names.length} files)`)
}

async function ensureMedia(productId, bannerUrl) {
  await prisma.productMedia.deleteMany({ where: { productId } })
  await prisma.productMedia.create({
    data: {
      productId,
      mediaUrl: resolveSeedMediaUrl(bannerUrl),
      isBanner: true,
      sortOrder: 0,
    },
  })
}

async function main() {
  ensureSeedImageFiles()

  const supplier = await prisma.user.findFirst({
    where: { email: 'supplier@test.local' },
  })
  if (!supplier) {
    throw new Error('supplier@test.local missing — run pnpm seed:demo first')
  }

  const category =
    (await prisma.category.findFirst({
      where: { subCategories: { none: {} } },
      orderBy: { name: 'asc' },
    })) ||
    (await prisma.category.findFirst({
      where: { parentCategory: { is: { parentCategoryId: { not: null } } } },
      orderBy: { name: 'asc' },
    })) ||
    (await prisma.category.findFirst({ orderBy: { name: 'asc' } }))
  if (!category) throw new Error('No category found')

  const plans = await prisma.promotionPlan.findMany({
    where: { durationDays: { in: [7, 15, 30] } },
  })
  const planByDays = Object.fromEntries(plans.map((p) => [p.durationDays, p]))
  const plan15 = planByDays[15] || plans[0]
  const plan30 = planByDays[30] || plans[0]
  const plan7 = planByDays[7] || plans[0]
  if (!plan15) throw new Error('No promotion plans — run pnpm seed:promotion-plans')

  const now = new Date()
  const slotSpecs = [
    {
      sku: 'MKT-SLOT-001',
      title: 'Sponsored Rebar Pack',
      slug: 'mkt-slot-rebar-demo',
      shortDescription: 'Homepage sponsored slot 1.',
      plan: plan15,
      image: '/uploads/seed/mkt-9.jpg',
    },
    {
      sku: 'MKT-SLOT-002',
      title: 'Sponsored Insulation Board',
      slug: 'mkt-slot-insulation-demo',
      shortDescription: 'Homepage sponsored slot 2.',
      plan: plan30,
      image: '/uploads/seed/mkt-10.jpg',
    },
    {
      sku: 'MKT-SLOT-003',
      title: 'Sponsored Drywall Sheets',
      slug: 'mkt-slot-drywall-demo',
      shortDescription: 'Homepage sponsored slot 3.',
      plan: plan7,
      image: '/uploads/seed/mkt-11.jpg',
    },
    {
      sku: 'MKT-SLOT-004',
      title: 'Sponsored Roof Membrane',
      slug: 'mkt-slot-roof-demo',
      shortDescription: 'Homepage sponsored slot 4.',
      plan: plan15,
      image: '/uploads/seed/mkt-12.jpg',
    },
    {
      sku: 'MKT-SLOT-005',
      title: 'Sponsored Concrete Additive',
      slug: 'mkt-slot-additive-demo',
      shortDescription: 'Homepage sponsored slot 5.',
      plan: plan30,
      image: '/uploads/seed/mkt-13.jpg',
    },
  ]

  for (let i = 0; i < slotSpecs.length; i += 1) {
    const spec = slotSpecs[i]
    let product = await prisma.product.findFirst({ where: { sku: spec.sku } })
    if (!product) {
      product = await prisma.product.create({
        data: {
          sellerId: supplier.id,
          categoryId: category.id,
          sku: spec.sku,
          title: spec.title,
          slug: spec.slug,
          shortDescription: spec.shortDescription,
          longDescription: `${spec.title} — sponsored homepage slot seed.`,
          specifications: 'Demo sponsored slot SKU',
          factoryName: 'Cimento do Tejo',
          basePrice: 14 + i,
          b2bPrice: 12 + i,
          minOrderQuantity: 5,
          unitOfMeasure: 'bags',
          weightKg: 25,
          marketplaceTier: 'RETAIL',
          approvalStatus: 'APPROVED',
          warehouseLocation: 'Rua de Campolide 88, Lisbon, Portugal',
          isFeatured: true,
          isSponsored: true,
        },
      })
    } else {
      product = await prisma.product.update({
        where: { id: product.id },
        data: {
          title: spec.title,
          shortDescription: spec.shortDescription,
          isFeatured: true,
          isSponsored: true,
          approvalStatus: 'APPROVED',
        },
      })
    }

    await prisma.inventory.upsert({
      where: { productId: product.id },
      create: {
        productId: product.id,
        currentStock: 200,
        listedQuantity: 200,
        lowStockThreshold: 20,
      },
      update: { currentStock: 200, listedQuantity: 200 },
    })
    await ensureMedia(product.id, spec.image)

    await prisma.productPromotion.deleteMany({
      where: { productId: product.id },
    })
    await prisma.productPromotion.create({
      data: {
        productId: product.id,
        planId: spec.plan.id,
        amountPaid: spec.plan.price,
        durationDays: spec.plan.durationDays,
        paymentStatus: 'PAID',
        paymentRef: `SEED-SLOT-${spec.sku}`,
        approvalStatus: 'APPROVED',
        startDate: new Date(now.getTime() - 2 * 86400000),
        endDate: new Date(now.getTime() + spec.plan.durationDays * 86400000),
        paidAt: new Date(now.getTime() - 5 * 86400000),
        reviewedAt: new Date(now.getTime() - 3 * 86400000),
      },
    })
  }

  // Refresh media for already-sponsored demo products that use /uploads/seed/*
  const sponsored = await prisma.product.findMany({
    where: { isSponsored: true },
    include: { media: { orderBy: { sortOrder: 'asc' } } },
  })
  for (const product of sponsored) {
    const url = product.media?.[0]?.mediaUrl
    if (url?.startsWith('/uploads/seed/')) {
      await ensureMedia(product.id, url)
    } else if (!url) {
      await ensureMedia(product.id, '/uploads/seed/cement-banner.jpg')
    }
  }

  // Ensure classic active marketing demos + cement stay sponsored
  await prisma.product.updateMany({
    where: {
      sku: {
        in: [
          'CEM-DEMO-001',
          'MKT-DEMO-003',
          'MKT-DEMO-004',
          ...slotSpecs.map((s) => s.sku),
        ],
      },
    },
    data: { isSponsored: true, isFeatured: true },
  })

  // portland-cement-quick-set-demo may use a different sku
  const cement = await prisma.product.findFirst({
    where: {
      OR: [
        { sku: 'CEM-DEMO-001' },
        { slug: 'portland-cement-quick-set-demo' },
      ],
    },
  })
  if (cement) {
    await prisma.product.update({
      where: { id: cement.id },
      data: { isSponsored: true, isFeatured: true },
    })
    const hasBanner = await prisma.productMedia.findFirst({
      where: { productId: cement.id, isBanner: true },
    })
    if (!hasBanner?.mediaUrl?.startsWith('/uploads/seed/')) {
      await ensureMedia(cement.id, '/uploads/seed/cement-banner.jpg')
    } else {
      await ensureMedia(cement.id, hasBanner.mediaUrl)
    }
  }

  const count = await prisma.product.count({ where: { isSponsored: true } })
  const rows = await prisma.product.findMany({
    where: { isSponsored: true },
    select: { sku: true, title: true, slug: true },
    orderBy: { title: 'asc' },
  })
  console.log(`Sponsored products: ${count}/${SPONSORED_SLOT_COUNT}`)
  for (const row of rows) {
    console.log(`  - ${row.sku}: ${row.title}`)
  }
  if (count > SPONSORED_SLOT_COUNT) {
    console.warn(
      `More than ${SPONSORED_SLOT_COUNT} sponsored — trim extras if testing slot limits.`,
    )
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
