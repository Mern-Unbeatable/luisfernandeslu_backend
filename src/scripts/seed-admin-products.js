/**
 * Extra products for GET /api/admin/products filters.
 * Each status × each root category gets 6 listings (plus a shared search term).
 *
 * Usage:
 *   pnpm seed:admin-products
 */
import 'dotenv/config'
import prisma from '../../lib/prisma.js'

const SKU_PREFIX = 'ADM-FILT-'
const PER_STATUS = 6
const STATUSES = [
  { status: 'DRAFT', code: 'DRF', label: 'Draft' },
  { status: 'PENDING_REVIEW', code: 'PEN', label: 'Pending' },
  { status: 'APPROVED', code: 'APP', label: 'Approved' },
  { status: 'REJECTED', code: 'REJ', label: 'Rejected' },
]

const BANNER_URLS = [
  'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
]

function firstLeaf(root) {
  const sub = root.subCategories?.[0]
  return sub?.subCategories?.[0] || sub || root
}

async function createInChunks(data, size = 80) {
  for (let i = 0; i < data.length; i += size) {
    await prisma.product.createMany({
      data: data.slice(i, i + size),
      skipDuplicates: true,
    })
  }
}

export async function seedAdminFilterProducts(sellerId) {
  const roots = await prisma.category.findMany({
    where: { parentCategoryId: null },
    orderBy: { name: 'asc' },
    include: {
      subCategories: {
        orderBy: { name: 'asc' },
        include: {
          subCategories: { orderBy: { name: 'asc' } },
        },
      },
    },
  })

  if (!roots.length) {
    throw new Error('Catalog is empty. Run: pnpm seed:catalog')
  }

  const specs = []
  roots.forEach((root, rootIndex) => {
    const leaf = firstLeaf(root)
    STATUSES.forEach((row) => {
      for (let n = 1; n <= PER_STATUS; n += 1) {
        specs.push({
          sellerId,
          categoryId: leaf.id,
          sku: `${SKU_PREFIX}${String(rootIndex + 1).padStart(2, '0')}-${row.code}-${n}`,
          title: `${leaf.name} ${row.label} ${n}`,
          slug: `adm-filt-${root.slug}-${row.status.toLowerCase()}-${n}`,
          shortDescription: `${root.name} — ${leaf.name}. Demo ${row.label.toLowerCase()} listing ${n} for admin product filters.`,
          longDescription: `Seeded admin-moderation product in ${root.name} / ${leaf.name}. Status ${row.status}.`,
          specifications: `Demo | ${root.slug} | ${row.status}`,
          factoryName: 'Cimento do Tejo',
          basePrice: 8 + rootIndex + n * 0.4,
          b2bPrice: 7 + rootIndex + n * 0.3,
          minOrderQuantity: 5,
          minB2bQuantity: 20,
          unitOfMeasure: 'bags',
          weightKg: 25,
          marketplaceTier: 'RETAIL',
          approvalStatus: row.status,
          rejectionReason:
            row.status === 'REJECTED' ? 'Demo seed — missing safety datasheet' : null,
          warehouseLocation: 'Rua de Campolide 88, Lisbon, Portugal',
        })
      }
    })
  })

  const searchLeaf = firstLeaf(roots[0])
  for (let n = 1; n <= PER_STATUS; n += 1) {
    specs.push({
      sellerId,
      categoryId: searchLeaf.id,
      sku: `${SKU_PREFIX}SEARCH-PEN-${n}`,
      title: `QuickSet Construction Mix ${n}`,
      slug: `adm-filt-quickset-search-${n}`,
      shortDescription: 'Searchable demo listing for admin product filters.',
      longDescription: 'Seeded so search=QuickSet returns six pending products.',
      specifications: 'Demo search SKU',
      factoryName: 'Cimento do Tejo',
      basePrice: 11 + n,
      b2bPrice: 9 + n,
      minOrderQuantity: 5,
      unitOfMeasure: 'bags',
      weightKg: 25,
      marketplaceTier: 'RETAIL',
      approvalStatus: 'PENDING_REVIEW',
      rejectionReason: null,
      warehouseLocation: 'Rua de Campolide 88, Lisbon, Portugal',
    })
  }

  const existingSkus = new Set(
    (
      await prisma.product.findMany({
        where: { sku: { startsWith: SKU_PREFIX } },
        select: { sku: true },
      })
    ).map((row) => row.sku),
  )
  const toCreate = specs.filter((row) => !existingSkus.has(row.sku))
  if (toCreate.length) await createInChunks(toCreate)

  const products = await prisma.product.findMany({
    where: { sku: { startsWith: SKU_PREFIX } },
    select: { id: true, sku: true },
    orderBy: { sku: 'asc' },
  })

  await prisma.productMedia.deleteMany({
    where: { product: { sku: { startsWith: SKU_PREFIX } } },
  })
  const mediaRows = products.map((product, index) => ({
    productId: product.id,
    mediaUrl: BANNER_URLS[index % BANNER_URLS.length],
    isBanner: true,
    sortOrder: 0,
  }))
  for (let i = 0; i < mediaRows.length; i += 100) {
    await prisma.productMedia.createMany({
      data: mediaRows.slice(i, i + 100),
    })
  }

  const counts = { DRAFT: 0, PENDING_REVIEW: 0, APPROVED: 0, REJECTED: 0 }
  const seeded = await prisma.product.groupBy({
    by: ['approvalStatus'],
    where: { sku: { startsWith: SKU_PREFIX } },
    _count: { _all: true },
  })
  for (const row of seeded) {
    counts[row.approvalStatus] = row._count._all
  }

  console.log(
    `Admin filter products: ${products.length} SKUs (${SKU_PREFIX}*) across ${roots.length} root categories`,
  )
  console.log(
    `  DRAFT=${counts.DRAFT}  PENDING_REVIEW=${counts.PENDING_REVIEW}  APPROVED=${counts.APPROVED}  REJECTED=${counts.REJECTED}`,
  )
  console.log('  Search sample: ?search=QuickSet&status=PENDING_REVIEW')

  return { total: products.length, counts, roots: roots.length }
}

async function main() {
  const supplier = await prisma.user.findUnique({
    where: { email: 'supplier@test.local' },
    select: { id: true },
  })
  if (!supplier) {
    throw new Error('supplier@test.local not found. Run: pnpm seed:demo')
  }
  await seedAdminFilterProducts(supplier.id)
}

const invokedDirectly = /seed-admin-products\.js$/i.test(
  String(process.argv[1] || '').replace(/\\/g, '/'),
)

if (invokedDirectly) {
  main()
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
