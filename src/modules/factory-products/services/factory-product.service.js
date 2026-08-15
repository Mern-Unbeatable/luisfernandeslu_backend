import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'
import { generateProductCopy } from '../../../lib/ai.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import {
  productFilePublicUrl,
  downloadRemoteProductImage,
} from '../../products/upload.js'
import { buildCategoryGuidePdf } from '../../products/services/catalog-guide-pdf.js'
import {
  parseCsv,
  decodeCsvBuffer,
  buildFactoryCsvTemplate,
  FACTORY_CSV_HEADERS,
} from './factory-csv.js'
import { factoryCreateBodySchema } from '../validations/factory-product.validation.js'

function httpError(message, status = 400, code = 'Error', details) {
  return new AppError(message, status, code, details)
}

const shortSelect = {
  id: true,
  sku: true,
  title: true,
  approvalStatus: true,
  rejectionReason: true,
}

function slugify(input) {
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
}

function publicSlug(slug) {
  if (!slug) return slug
  const parts = String(slug).split('__')
  return parts[parts.length - 1]
}

function featureLines(text) {
  return String(text || '')
    .replace(/\\n/g, '\n')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean)
}

function mapCategoryNode(node) {
  if (!node) return null
  return {
    id: node.id,
    slug: publicSlug(node.slug),
    name: node.name,
  }
}

async function resolveCategoryPath(productTypeId) {
  const productType = await prisma.category.findUnique({
    where: { id: productTypeId },
    select: {
      id: true,
      slug: true,
      name: true,
      parentCategoryId: true,
      parentCategory: {
        select: {
          id: true,
          slug: true,
          name: true,
          parentCategoryId: true,
          parentCategory: {
            select: {
              id: true,
              slug: true,
              name: true,
              parentCategoryId: true,
            },
          },
        },
      },
    },
  })

  if (!productType?.parentCategory?.parentCategory) return null
  const subCategory = productType.parentCategory
  const category = subCategory.parentCategory
  if (category.parentCategoryId !== null) return null
  return { category, subCategory, productType }
}

async function validateCategoryPath(body) {
  const path = await resolveCategoryPath(body.productTypeId)
  if (!path) throw httpError('Invalid product type', 400, 'InvalidProductType')
  if (path.category.id !== body.categoryId) {
    throw httpError(
      'productTypeId does not belong to categoryId',
      400,
      'CategoryMismatch',
    )
  }
  if (path.subCategory.id !== body.subCategoryId) {
    throw httpError(
      'productTypeId does not belong to subCategoryId',
      400,
      'SubCategoryMismatch',
    )
  }
  return path
}

/**
 * Resolve catalog path from human-readable names (CSV).
 */
async function resolveCategoryPathByNames({ category, subCategory, productType }) {
  const categoryName = String(category || '').trim().normalize('NFC')
  const subName = String(subCategory || '').trim().normalize('NFC')
  const typeName = String(productType || '').trim().normalize('NFC')

  if (!categoryName || !subName || !typeName) {
    throw httpError(
      'category, subCategory and productType names are required',
      400,
      'CategoryNamesRequired',
    )
  }

  const root = await prisma.category.findFirst({
    where: {
      name: { equals: categoryName, mode: 'insensitive' },
      parentCategoryId: null,
    },
    select: { id: true, name: true },
  })
  if (!root) {
    throw httpError(`Category not found: "${categoryName}"`, 404, 'CategoryNotFound')
  }

  const sub = await prisma.category.findFirst({
    where: {
      name: { equals: subName, mode: 'insensitive' },
      parentCategoryId: root.id,
    },
    select: { id: true, name: true },
  })
  if (!sub) {
    throw httpError(
      `Subcategory not found under "${root.name}": "${subName}"`,
      404,
      'SubCategoryNotFound',
    )
  }

  const leaf = await prisma.category.findFirst({
    where: {
      name: { equals: typeName, mode: 'insensitive' },
      parentCategoryId: sub.id,
    },
    select: { id: true, name: true },
  })
  if (!leaf) {
    throw httpError(
      `Product type not found under "${sub.name}": "${typeName}"`,
      404,
      'ProductTypeNotFound',
    )
  }

  return {
    categoryId: root.id,
    subCategoryId: sub.id,
    productTypeId: leaf.id,
  }
}

function buildListingParts(body, files = {}, factoryName = null) {
  const bannerFiles = files?.bannerImage || []
  const otherFiles = files?.images || []
  const mediaCreates = []
  if (bannerFiles[0]) {
    mediaCreates.push({
      mediaUrl: productFilePublicUrl(bannerFiles[0]),
      isBanner: true,
      sortOrder: 0,
    })
  }
  otherFiles.forEach((file, index) => {
    mediaCreates.push({
      mediaUrl: productFilePublicUrl(file),
      isBanner: false,
      sortOrder: index + 1,
    })
  })

  const featureRows = featureLines(body.feature).map((featureText) => ({
    featureText,
  }))

  const sharedData = {
    title: body.title.trim(),
    warehouseLocation: body.warehouseLocation.trim(),
    factoryName: factoryName || null,
    basePrice: body.basePrice,
    b2bPrice: null,
    minB2bQuantity: null,
    weightKg: body.weightKg ?? 0,
    unitOfMeasure: 'bag',
    longDescription: body.description || null,
    shortDescription: body.additionalInfo || null,
    specifications: body.specifications || null,
    marketplaceTier: 'RETAIL',
    approvalStatus: 'PENDING_REVIEW',
    rejectionReason: null,
  }

  return { sharedData, mediaCreates, featureRows }
}

function resolveUiStatus(approvalStatus) {
  if (approvalStatus === 'PENDING_REVIEW') return 'pending'
  if (approvalStatus === 'REJECTED') return 'rejected'
  if (approvalStatus === 'DRAFT') return 'draft'
  if (approvalStatus === 'APPROVED') return 'active'
  return String(approvalStatus || '').toLowerCase()
}

const productInclude = {
  features: true,
  media: { orderBy: { sortOrder: 'asc' } },
  category: {
    include: {
      parentCategory: {
        include: { parentCategory: true },
      },
    },
  },
}

function mapFactoryProduct(product, baseUrl) {
  const path =
    product.category?.parentCategory?.parentCategory
      ? {
          productType: product.category,
          subCategory: product.category.parentCategory,
          category: product.category.parentCategory.parentCategory,
        }
      : null

  const bannerImage =
    (product.media || [])
      .filter((m) => m.isBanner)
      .map((m) => ({
        id: m.id,
        url: absolutizeUrl(m.mediaUrl, baseUrl),
      }))[0] || null

  const images = (product.media || [])
    .filter((m) => !m.isBanner)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => ({
      id: m.id,
      url: absolutizeUrl(m.mediaUrl, baseUrl),
    }))

  const gallery = [...(bannerImage ? [bannerImage] : []), ...images]
  const uiStatus = resolveUiStatus(product.approvalStatus)

  return {
    id: product.id,
    sku: product.sku,
    title: product.title,
    warehouseLocation: product.warehouseLocation,
    factoryName: product.factoryName,
    basePrice: product.basePrice,
    weightKg: product.weightKg,
    unitOfMeasure: product.unitOfMeasure || 'bag',
    priceLabel: `$${Number(product.basePrice).toFixed(2)} Per ${
      product.unitOfMeasure || 'bag'
    }${product.weightKg ? ` ( ${product.weightKg}kg )` : ''}`,
    description: product.longDescription,
    additionalInfo: product.shortDescription,
    specifications: product.specifications,
    feature: (product.features || []).map((f) => f.featureText).join('\n'),
    features: (product.features || []).map((f) => f.featureText),
    bannerImage,
    images,
    gallery,
    category: mapCategoryNode(path?.category),
    subCategory: mapCategoryNode(path?.subCategory),
    productType: mapCategoryNode(path?.productType || product.category),
    approvalStatus: product.approvalStatus,
    rejectionReason: product.rejectionReason || null,
    status: uiStatus,
    cardStatus: uiStatus,
    hasInventory: false,
    averageRating: Number(product.averageRating ?? 0),
    reviewCount: Number(product.reviewCount ?? 0),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  }
}

async function resolveFactoryName(userId) {
  const profile = await prisma.businessProfile.findUnique({
    where: { userId },
    select: { companyName: true },
  })
  return profile?.companyName?.trim() || null
}

async function buildCsvFilesFromUrls(sellerId, row) {
  const files = { bannerImage: [], images: [] }
  if (row.bannerImageUrl) {
    const file = await downloadRemoteProductImage(
      sellerId,
      row.bannerImageUrl,
      'banner',
    )
    files.bannerImage.push(file)
  }
  const urls = String(row.imageUrls || '')
    .split(/[;|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  for (let i = 0; i < urls.length; i += 1) {
    const file = await downloadRemoteProductImage(
      sellerId,
      urls[i],
      `img${i + 1}`,
    )
    files.images.push(file)
  }
  return files
}

function mapCsvRowToBody(row, pathIds) {
  const feature = String(row.feature || '')
    .split(/[;\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n')

  return {
    sku: row.sku,
    title: row.title,
    warehouseLocation: row.warehouseLocation,
    categoryId: pathIds.categoryId,
    subCategoryId: pathIds.subCategoryId,
    productTypeId: pathIds.productTypeId,
    basePrice: row.basePrice,
    weightKg: row.weightKg === '' ? 0 : row.weightKg,
    description: row.description || '',
    feature,
    additionalInfo: row.additionalInfo || '',
    specifications: row.specifications || '',
  }
}

class FactoryProductService {
  assertFactory(auth) {
    if (!auth?.id || auth.role !== 'factory') {
      throw httpError('Factory access only', 403, 'Forbidden')
    }
  }

  async generateAi(auth, body) {
    this.assertFactory(auth)
    try {
      const result = await generateProductCopy(body)
      return {
        status: 200,
        body: {
          field: result.field,
          content: result.content,
          provider: result.provider,
          message: 'AI content generated',
        },
      }
    } catch (err) {
      if (err.status) {
        throw httpError(err.message, err.status, err.code || 'Error')
      }
      throw err
    }
  }

  /**
   * Factory direct product — no inventory. Always PENDING_REVIEW for admin.
   */
  async create(auth, body, files, _baseUrl) {
    this.assertFactory(auth)

    const sku = body.sku.trim()
    await validateCategoryPath(body)
    const factoryName = await resolveFactoryName(auth.id)
    const { sharedData, mediaCreates, featureRows } = buildListingParts(
      body,
      files,
      factoryName,
    )

    const existing = await prisma.product.findUnique({
      where: { sku },
      select: {
        id: true,
        sellerId: true,
        approvalStatus: true,
        inventory: { select: { id: true } },
      },
    })

    if (existing && existing.sellerId !== auth.id) {
      throw httpError('SKU already exists', 409, 'SkuExists')
    }

    if (existing?.inventory) {
      throw httpError(
        'This SKU belongs to an inventory product and cannot be used for factory direct listing',
        409,
        'InventorySkuConflict',
      )
    }

    // Re-open cancelled DRAFT with same SKU
    if (existing) {
      if (
        existing.approvalStatus === 'PENDING_REVIEW' ||
        existing.approvalStatus === 'APPROVED'
      ) {
        throw new AppError(
          'This product is already added. Please edit the existing product instead.',
          409,
          'UseEditInstead',
          {
            productId: existing.id,
            sku,
            approvalStatus: existing.approvalStatus,
            canEdit: true,
          },
        )
      }

      const product = await prisma.product.update({
        where: { id: existing.id },
        data: {
          ...sharedData,
          category: { connect: { id: body.productTypeId } },
          features: { deleteMany: {}, create: featureRows },
          ...(mediaCreates.length
            ? { media: { deleteMany: {}, create: mediaCreates } }
            : {}),
        },
        select: shortSelect,
      })

      return {
        status: 200,
        body: {
          ...product,
          message: 'Product submitted for admin verification',
        },
      }
    }

    try {
      const product = await prisma.product.create({
        data: {
          ...sharedData,
          seller: { connect: { id: auth.id } },
          category: { connect: { id: body.productTypeId } },
          sku,
          slug: `${slugify(body.title.trim()) || 'product'}-${Date.now().toString(36)}`,
          features: featureRows.length ? { create: featureRows } : undefined,
          media: mediaCreates.length ? { create: mediaCreates } : undefined,
        },
        select: shortSelect,
      })

      return {
        status: 201,
        body: {
          ...product,
          message: 'Product created and submitted for admin verification',
        },
      }
    } catch (err) {
      if (err?.code === 'P2002') {
        throw httpError('SKU already exists', 409, 'SkuExists')
      }
      throw err
    }
  }

  async update(auth, productId, body, files, _baseUrl) {
    this.assertFactory(auth)

    const product = await prisma.product.findFirst({
      where: { id: productId, sellerId: auth.id },
      select: {
        id: true,
        sku: true,
        approvalStatus: true,
        inventory: { select: { id: true } },
      },
    })

    if (!product) throw httpError('Product not found', 404, 'NotFound')
    if (product.inventory) {
      throw httpError(
        'Inventory-backed products cannot be edited here',
        400,
        'InventoryProduct',
      )
    }

    const factoryName = await resolveFactoryName(auth.id)
    const { sharedData, mediaCreates, featureRows } = buildListingParts(
      body,
      files,
      factoryName,
    )

    const nextStatus =
      product.approvalStatus === 'REJECTED' ? 'REJECTED' : 'PENDING_REVIEW'

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        ...sharedData,
        approvalStatus: nextStatus,
        ...(nextStatus === 'PENDING_REVIEW' ? { rejectionReason: null } : {}),
        features: { deleteMany: {}, create: featureRows },
        ...(mediaCreates.length
          ? { media: { deleteMany: {}, create: mediaCreates } }
          : {}),
      },
      select: shortSelect,
    })

    return {
      status: 200,
      body: {
        ...updated,
        message:
          nextStatus === 'REJECTED'
            ? 'Product updated. Click Resubmit when you are ready for review.'
            : 'Product updated and submitted for admin verification',
      },
    }
  }

  async resubmit(auth, productId, body, files = {}, _baseUrl) {
    this.assertFactory(auth)

    const product = await prisma.product.findFirst({
      where: { id: productId, sellerId: auth.id },
      select: {
        id: true,
        approvalStatus: true,
        inventory: { select: { id: true } },
      },
    })

    if (!product) throw httpError('Product not found', 404, 'NotFound')
    if (product.inventory) {
      throw httpError(
        'Inventory-backed products cannot be resubmitted here',
        400,
        'InventoryProduct',
      )
    }
    if (product.approvalStatus !== 'REJECTED') {
      throw httpError(
        'Only rejected products can be resubmitted',
        400,
        'NotRejected',
      )
    }

    const factoryName = await resolveFactoryName(auth.id)
    const { sharedData, mediaCreates, featureRows } = buildListingParts(
      body,
      files,
      factoryName,
    )

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        ...sharedData,
        approvalStatus: 'PENDING_REVIEW',
        rejectionReason: null,
        features: { deleteMany: {}, create: featureRows },
        ...(mediaCreates.length
          ? { media: { deleteMany: {}, create: mediaCreates } }
          : {}),
      },
      select: shortSelect,
    })

    return {
      status: 200,
      body: {
        ...updated,
        rejectionReason: null,
        message: 'Product resubmitted for admin verification',
      },
    }
  }

  /** Cancel pending → DRAFT (no inventory to restore). */
  async cancel(auth, productId) {
    this.assertFactory(auth)

    const product = await prisma.product.findFirst({
      where: { id: productId, sellerId: auth.id },
      select: {
        id: true,
        sku: true,
        title: true,
        approvalStatus: true,
        inventory: { select: { id: true } },
      },
    })

    if (!product) throw httpError('Product not found', 404, 'NotFound')
    if (product.inventory) {
      throw httpError(
        'Inventory-backed products cannot be cancelled here',
        400,
        'InventoryProduct',
      )
    }
    if (product.approvalStatus !== 'PENDING_REVIEW') {
      throw httpError(
        'Only pending products can be cancelled',
        400,
        'NotPending',
      )
    }

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        approvalStatus: 'DRAFT',
        rejectionReason: null,
      },
      select: shortSelect,
    })

    return {
      status: 200,
      body: {
        ...updated,
        message:
          'Product cancelled. It is saved as draft — edit and submit again anytime.',
      },
    }
  }

  async remove(auth, productId) {
    this.assertFactory(auth)

    const product = await prisma.product.findFirst({
      where: { id: productId, sellerId: auth.id },
      select: {
        id: true,
        sku: true,
        title: true,
        inventory: { select: { id: true } },
        _count: { select: { orderLineItems: true, quoteItems: true } },
      },
    })

    if (!product) throw httpError('Product not found', 404, 'NotFound')
    if (product.inventory) {
      throw httpError(
        'Inventory-backed products cannot be deleted here',
        400,
        'InventoryProduct',
      )
    }
    if (product._count.orderLineItems > 0 || product._count.quoteItems > 0) {
      throw httpError(
        'Cannot delete a product that is used in orders or quotes',
        409,
        'ProductInUse',
      )
    }

    await prisma.product.delete({ where: { id: product.id } })

    return {
      status: 200,
      body: {
        id: product.id,
        sku: product.sku,
        title: product.title,
        message: 'Product deleted',
      },
    }
  }

  async list(auth, query, baseUrl) {
    this.assertFactory(auth)

    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12))
    const skip = (page - 1) * limit
    const tab = String(query.tab || 'all').toLowerCase()
    const search = query.search?.trim() || ''

    let categoryId = query.categoryId || null
    let categoryName = query.category?.trim() || null

    if (!categoryId && categoryName) {
      const cat = await prisma.category.findFirst({
        where: { name: { equals: categoryName, mode: 'insensitive' } },
        select: { id: true, name: true },
      })
      if (!cat) {
        throw httpError(
          `Category not found: "${categoryName}"`,
          404,
          'CategoryNotFound',
        )
      }
      categoryId = cat.id
      categoryName = cat.name
    } else if (categoryId) {
      const cat = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true, name: true },
      })
      if (!cat) throw httpError('Category not found', 404, 'CategoryNotFound')
      categoryName = cat.name
    }

    const and = [{ sellerId: auth.id }, { inventory: { is: null } }]

    if (tab === 'active') {
      and.push({ approvalStatus: 'APPROVED' })
    } else if (tab === 'pending') {
      and.push({ approvalStatus: 'PENDING_REVIEW' })
    } else if (tab === 'rejected') {
      and.push({ approvalStatus: 'REJECTED' })
    } else {
      // all — include draft cancelled items
      and.push({
        approvalStatus: {
          in: ['APPROVED', 'PENDING_REVIEW', 'REJECTED', 'DRAFT'],
        },
      })
    }

    if (categoryId) {
      and.push({
        OR: [
          { categoryId },
          { category: { parentCategoryId: categoryId } },
          {
            category: {
              parentCategory: { parentCategoryId: categoryId },
            },
          },
        ],
      })
    }

    if (search) {
      and.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
        ],
      })
    }

    const where = { AND: and }

    const [total, rows, counts] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.getTabCounts(auth.id, categoryId),
    ])

    return {
      status: 200,
      body: {
        products: rows.map((p) => mapFactoryProduct(p, baseUrl)),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        counts,
        filters: {
          tab,
          categoryId: categoryId || null,
          category: categoryName || null,
          search: search || null,
        },
        message: 'Factory products fetched',
      },
    }
  }

  async getTabCounts(sellerId, categoryId = null) {
    const categoryFilter = categoryId
      ? {
          OR: [
            { categoryId },
            { category: { parentCategoryId: categoryId } },
            {
              category: {
                parentCategory: { parentCategoryId: categoryId },
              },
            },
          ],
        }
      : null

    const withCategory = (extra) => {
      const parts = [
        { sellerId },
        { inventory: { is: null } },
        ...(categoryFilter ? [categoryFilter] : []),
      ]
      if (extra) parts.push(extra)
      return { AND: parts }
    }

    const [all, active, pending, rejected] = await Promise.all([
      prisma.product.count({
        where: withCategory({
          approvalStatus: {
            in: ['APPROVED', 'PENDING_REVIEW', 'REJECTED', 'DRAFT'],
          },
        }),
      }),
      prisma.product.count({
        where: withCategory({ approvalStatus: 'APPROVED' }),
      }),
      prisma.product.count({
        where: withCategory({ approvalStatus: 'PENDING_REVIEW' }),
      }),
      prisma.product.count({
        where: withCategory({ approvalStatus: 'REJECTED' }),
      }),
    ])

    return { all, active, pending, rejected }
  }

  async getById(auth, productId, baseUrl) {
    this.assertFactory(auth)

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        sellerId: auth.id,
        inventory: { is: null },
      },
      include: productInclude,
    })

    if (!product) throw httpError('Product not found', 404, 'NotFound')

    return {
      status: 200,
      body: {
        product: mapFactoryProduct(product, baseUrl),
        message: 'Product details fetched',
      },
    }
  }

  getCsvTemplate() {
    const csv = buildFactoryCsvTemplate()
    return {
      filename: 'factory-products-template.csv',
      contentType: 'text/csv; charset=utf-8',
      headers: FACTORY_CSV_HEADERS,
      body: Buffer.from(`\uFEFF${csv}`, 'utf8'),
    }
  }

  async getCategoryGuidePdf() {
    const pdf = await buildCategoryGuidePdf()
    return {
      filename: 'category-subcategory-type-guide.pdf',
      contentType: 'application/pdf',
      body: pdf,
    }
  }

  async importCsv(auth, fileBuffer) {
    this.assertFactory(auth)

    if (!fileBuffer?.length) {
      throw httpError('CSV file is required', 400, 'CsvRequired')
    }

    const text = decodeCsvBuffer(fileBuffer)
    const { headers, records } = parseCsv(text)

    if (!headers.length) {
      throw httpError('CSV is empty or invalid', 400, 'InvalidCsv')
    }

    const required = [
      'sku',
      'title',
      'warehouseLocation',
      'category',
      'subCategory',
      'productType',
      'basePrice',
    ]
    const missing = required.filter((h) => !headers.includes(h))
    if (missing.length) {
      throw httpError(
        `CSV is missing required columns: ${missing.join(', ')}`,
        400,
        'MissingColumns',
        { missing, expectedHeaders: FACTORY_CSV_HEADERS },
      )
    }

    if (!records.length) {
      throw httpError('CSV has headers but no data rows', 400, 'EmptyCsv')
    }
    if (records.length > 100) {
      throw httpError(
        'CSV may contain at most 100 rows per upload',
        400,
        'TooManyRows',
      )
    }

    const created = []
    const failed = []

    for (const row of records) {
      const sku = row.sku || null
      try {
        const pathIds = await resolveCategoryPathByNames({
          category: row.category,
          subCategory: row.subCategory,
          productType: row.productType,
        })
        const raw = mapCsvRowToBody(row, pathIds)
        const parsed = factoryCreateBodySchema.safeParse(raw)
        if (!parsed.success) {
          const issues = parsed.error.issues?.map((i) => i.message) || [
            'Invalid row',
          ]
          failed.push({
            row: row.__row,
            sku,
            message: issues.join('; '),
            code: 'ValidationError',
          })
          continue
        }

        const files = await buildCsvFilesFromUrls(auth.id, row)
        const result = await this.create(auth, parsed.data, files)
        created.push({
          row: row.__row,
          id: result.body.id,
          sku: result.body.sku,
          title: result.body.title,
          approvalStatus: result.body.approvalStatus,
          category: row.category,
          subCategory: row.subCategory,
          productType: row.productType,
          hasBanner: Boolean(files.bannerImage?.length),
          imageCount: files.images?.length || 0,
        })
      } catch (err) {
        failed.push({
          row: row.__row,
          sku,
          message: err.message || 'Failed to import row',
          code: err.code || 'Error',
        })
      }
    }

    return {
      status: 200,
      body: {
        summary: {
          total: records.length,
          created: created.length,
          failed: failed.length,
        },
        created,
        failed,
        expectedHeaders: FACTORY_CSV_HEADERS,
        message:
          failed.length === 0
            ? `Imported ${created.length} product(s) successfully`
            : `Imported ${created.length} product(s), ${failed.length} failed`,
      },
    }
  }
}

export default new FactoryProductService()
