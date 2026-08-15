import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'
import { generateProductCopy } from '../../../lib/ai.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { productFilePublicUrl } from '../upload.js'
import { assertCanSubmitListing, getListingQuota } from './listing-quota.js'
import {
  getStockBreakdown,
  assertListedWithinWarehouse,
  isMarketplaceListed,
} from './stock-listing.js'

function httpError(message, status = 400, code = 'Error') {
  return new AppError(message, status, code)
}

const shortSelect = {
  id: true,
  sku: true,
  title: true,
  approvalStatus: true,
}

function buildListingParts(body, files = {}) {
  const discount = Number(body.b2bDiscount || 0)
  const b2bPrice =
    discount > 0
      ? Number((body.basePrice * (1 - discount / 100)).toFixed(2))
      : null

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
  const bulkEnabled = Boolean(body.bulkEnabled)
  const tierCreates = (bulkEnabled ? body.bulkOptions || [] : []).map((t) => ({
    minQuantity: t.minQuantity,
    maxQuantity: t.maxQuantity ?? null,
    tierPrice: t.price,
  }))

  const sharedData = {
    title: body.title.trim(),
    warehouseLocation: body.warehouseLocation.trim(),
    factoryName: body.factoryName?.trim() || null,
    basePrice: body.basePrice,
    b2bPrice,
    minB2bQuantity: body.minB2bQuantity ?? null,
    weightKg: body.weightKg ?? 0,
    unitOfMeasure: 'bag',
    longDescription: body.description || null,
    shortDescription: body.additionalInfo || null,
    specifications: body.specifications || null,
    marketplaceTier: bulkEnabled ? 'WHOLESALE' : 'RETAIL',
    approvalStatus: 'PENDING_REVIEW',
    rejectionReason: null,
  }

  return { sharedData, mediaCreates, featureRows, tierCreates }
}

async function validateCategoryPath(body) {
  const path = await resolveCategoryPath(body.productTypeId)
  if (!path) throw httpError('Invalid product type', 400, 'InvalidProductType')
  if (path.category.id !== body.categoryId) {
    throw httpError('productTypeId does not belong to categoryId', 400, 'CategoryMismatch')
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

function mapCategoryNode(node) {
  if (!node) return null
  return {
    id: node.id,
    slug: publicSlug(node.slug),
    name: node.name,
  }
}

function mapProduct(product, baseUrl, categoryPath = null) {
  const stockInfo = getStockBreakdown(
    product.inventory,
    product.approvalStatus,
  )
  const path =
    categoryPath ||
    (product.category?.parentCategory?.parentCategory
      ? {
          productType: product.category,
          subCategory: product.category.parentCategory,
          category: product.category.parentCategory.parentCategory,
        }
      : null)

  const b2bDiscount =
    product.b2bPrice != null && product.basePrice > 0
      ? Number(
          (
            ((product.basePrice - product.b2bPrice) / product.basePrice) *
            100
          ).toFixed(2),
        )
      : 0

  return {
    id: product.id,
    sku: product.sku,
    title: product.title,
    warehouseLocation: product.warehouseLocation,
    factoryName: product.factoryName,
    quantity: stockInfo.warehouseStock,
    warehouseStock: stockInfo.warehouseStock,
    listedQuantity: stockInfo.listedQuantity,
    remainingListable: stockInfo.remainingListable,
    basePrice: product.basePrice,
    b2bPrice: product.b2bPrice,
    b2bDiscount,
    minB2bQuantity: product.minB2bQuantity,
    weightKg: product.weightKg,
    unitOfMeasure: product.unitOfMeasure,
    description: product.longDescription,
    additionalInfo: product.shortDescription,
    specifications: product.specifications,
    feature: (product.features || []).map((f) => f.featureText).join('\n'),
    features: (product.features || []).map((f) => f.featureText),
    bulkOptions: (product.pricingTiers || []).map((t) => ({
      id: t.id,
      minQuantity: t.minQuantity,
      maxQuantity: t.maxQuantity,
      price: t.tierPrice,
    })),
    bannerImage:
      (product.media || [])
        .filter((m) => m.isBanner)
        .map((m) => ({
          id: m.id,
          url: absolutizeUrl(m.mediaUrl, baseUrl),
        }))[0] || null,
    images: (product.media || [])
      .filter((m) => !m.isBanner)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => ({
        id: m.id,
        url: absolutizeUrl(m.mediaUrl, baseUrl),
      })),
    category: mapCategoryNode(path?.category),
    subCategory: mapCategoryNode(path?.subCategory),
    productType: mapCategoryNode(path?.productType || product.category),
    approvalStatus: product.approvalStatus,
    rejectionReason: product.rejectionReason || null,
    marketplaceTier: product.marketplaceTier,
    isSponsored: Boolean(product.isSponsored),
    isFeatured: Boolean(product.isFeatured),
    cardStatus: resolveCardStatus(product),
    promotionExpiry: resolvePromotionExpiry(product),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  }
}

function resolveCardStatus(product) {
  if (product.approvalStatus === 'PENDING_REVIEW') return 'pending'
  if (product.approvalStatus === 'REJECTED') return 'rejected'
  if (product.approvalStatus === 'DRAFT') return 'draft'
  // Inventory-only (approved stock, not yet marketplace-listed)
  if (
    product.approvalStatus === 'APPROVED' &&
    Number(product.inventory?.listedQuantity ?? 0) <= 0
  ) {
    return 'draft'
  }
  if (product.isFeatured || product.isSponsored) return 'featured'
  if (product.marketplaceTier === 'WHOLESALE') return 'bulk'
  return 'regular'
}

function resolvePromotionExpiry(product) {
  const active = (product.promotions || []).find(
    (p) => p.approvalStatus === 'APPROVED' && p.endDate,
  )
  return active?.endDate || null
}

const productInclude = {
  inventory: true,
  features: true,
  pricingTiers: { orderBy: { minQuantity: 'asc' } },
  media: { orderBy: { sortOrder: 'asc' } },
  promotions: {
    where: { approvalStatus: 'APPROVED' },
    orderBy: { endDate: 'desc' },
    take: 1,
  },
  category: {
    include: {
      parentCategory: {
        include: { parentCategory: true },
      },
    },
  },
}

export class ProductService {
  assertSupplier(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    if (auth.role !== 'supplier') {
      throw httpError('Only suppliers can manage products', 403, 'Forbidden')
    }
  }

  /** Autofill warehouse / taxonomy / title from supplier inventory SKU. */
  async lookupBySku(auth, sku, baseUrl) {
    this.assertSupplier(auth)
    const normalized = String(sku).trim()

    const product = await prisma.product.findFirst({
      where: { sellerId: auth.id, sku: normalized },
      include: productInclude,
    })

    if (!product) {
      throw httpError('No inventory product found for this SKU', 404, 'SkuNotFound')
    }

    const mapped = mapProduct(product, baseUrl)
    const alreadyListed = isMarketplaceListed(
      product.approvalStatus,
      product.inventory,
    )

    return {
      status: 200,
      body: {
        product: mapped,
        canAdd: !alreadyListed,
        canEdit: alreadyListed,
        message: alreadyListed
          ? 'This SKU is already listed. Use Edit Product to change it.'
          : 'SKU matched — fields can be autofilled',
      },
    }
  }

  async generateAi(auth, body) {
    this.assertSupplier(auth)
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
   * Add Product — first marketplace listing for inventory SKU → PENDING_REVIEW.
   * Inventory-only APPROVED (listedQuantity 0) can still be added.
   * Already marketplace-listed → use Edit instead.
   */
  async create(auth, body, files, _baseUrl) {
    this.assertSupplier(auth)

    const sku = body.sku.trim()
    const requested = Number(body.quantity)
    if (!(requested > 0)) {
      throw new AppError('Quantity must be greater than 0', 400, 'InvalidQuantity')
    }

    const { sharedData, mediaCreates, featureRows, tierCreates } =
      buildListingParts(body, files)

    const existing = await prisma.product.findUnique({
      where: { sku },
      select: {
        id: true,
        sellerId: true,
        approvalStatus: true,
        inventory: {
          select: { id: true, currentStock: true, listedQuantity: true },
        },
      },
    })

    if (existing && existing.sellerId !== auth.id) {
      throw httpError('SKU already exists', 409, 'SkuExists')
    }

    if (
      existing &&
      isMarketplaceListed(existing.approvalStatus, existing.inventory)
    ) {
      const stockInfo = getStockBreakdown(
        existing.inventory,
        existing.approvalStatus,
      )
      throw new AppError(
        'This product is already added. Please edit the existing listing instead of adding it again.',
        409,
        'UseEditInstead',
        {
          productId: existing.id,
          sku,
          approvalStatus: existing.approvalStatus,
          ...stockInfo,
          canAdd: false,
          canEdit: true,
        },
      )
    }

    // Inventory product exists (APPROVED/DRAFT/REJECTED) — first list / re-list
    if (existing) {
      if (!existing.inventory) {
        throw httpError(
          'Add this SKU to inventory before listing it',
          400,
          'InventoryRequired',
        )
      }

      const check = assertListedWithinWarehouse(existing.inventory, requested)
      if (!check.ok) {
        throw new AppError(
          `You can list at most ${check.warehouseStock} bag(s) from warehouse stock. You tried: ${requested}.`,
          400,
          'InsufficientStock',
          {
            warehouseStock: check.warehouseStock,
            listedQuantity: 0,
            remainingListable: check.warehouseStock,
            maxListableTotal: check.warehouseStock,
            requestedQuantity: requested,
            unitOfMeasure: 'bag',
          },
        )
      }

      await assertCanSubmitListing(auth.id, {
        productId: existing.id,
        alreadyListed: false,
      })
      await validateCategoryPath(body)

      const product = await prisma.product.update({
        where: { id: existing.id },
        data: {
          ...sharedData,
          category: { connect: { id: body.productTypeId } },
          inventory: { update: { listedQuantity: requested } },
          features: { deleteMany: {}, create: featureRows },
          pricingTiers: { deleteMany: {}, create: tierCreates },
          ...(mediaCreates.length
            ? { media: { deleteMany: {}, create: mediaCreates } }
            : {}),
        },
        select: {
          ...shortSelect,
          inventory: {
            select: { currentStock: true, listedQuantity: true },
          },
        },
      })

      const after = getStockBreakdown(product.inventory, product.approvalStatus)
      return {
        status: 200,
        body: {
          id: product.id,
          sku: product.sku,
          title: product.title,
          approvalStatus: product.approvalStatus,
          ...after,
          listingQuota: await getListingQuota(auth.id),
          message: 'Product listing submitted for review',
        },
      }
    }

    // Brand-new SKU (no inventory row yet)
    await assertCanSubmitListing(auth.id)
    await validateCategoryPath(body)

    try {
      const product = await prisma.product.create({
        data: {
          ...sharedData,
          seller: { connect: { id: auth.id } },
          category: { connect: { id: body.productTypeId } },
          sku,
          slug: `${slugify(body.title.trim()) || 'product'}-${Date.now().toString(36)}`,
          inventory: {
            create: {
              currentStock: requested,
              listedQuantity: requested,
              lowStockThreshold: 10,
            },
          },
          features: featureRows.length ? { create: featureRows } : undefined,
          pricingTiers: tierCreates.length ? { create: tierCreates } : undefined,
          media: mediaCreates.length ? { create: mediaCreates } : undefined,
        },
        select: {
          ...shortSelect,
          inventory: {
            select: { currentStock: true, listedQuantity: true },
          },
        },
      })

      const after = getStockBreakdown(product.inventory, product.approvalStatus)
      return {
        status: 201,
        body: {
          id: product.id,
          sku: product.sku,
          title: product.title,
          approvalStatus: product.approvalStatus,
          ...after,
          listingQuota: await getListingQuota(auth.id),
          message: 'Product created and submitted for review',
        },
      }
    } catch (err) {
      if (err?.code === 'P2002') {
        throw httpError('SKU already exists', 409, 'SkuExists')
      }
      throw err
    }
  }

  /**
   * Edit listed (PENDING/APPROVED) or rejected product.
   * REJECTED stays REJECTED until Resubmit.
   * PENDING/APPROVED edits go back to PENDING_REVIEW.
   * quantity = total bags to keep listed (≤ warehouse). Locked: sku/category path.
   */
  async update(auth, productId, body, files, _baseUrl) {
    this.assertSupplier(auth)

    const requested = Number(body.quantity)
    if (!(requested > 0)) {
      throw new AppError('Quantity must be greater than 0', 400, 'InvalidQuantity')
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, sellerId: auth.id },
      select: {
        id: true,
        sku: true,
        approvalStatus: true,
        inventory: {
          select: { id: true, currentStock: true, listedQuantity: true },
        },
      },
    })

    if (!product) {
      throw httpError('Product not found', 404, 'NotFound')
    }

    const canEdit =
      product.approvalStatus === 'REJECTED' ||
      isMarketplaceListed(product.approvalStatus, product.inventory)

    if (!canEdit) {
      throw new AppError(
        'This product is not listed yet. Use Add Product to submit it for review.',
        400,
        'UseAddInstead',
        {
          productId: product.id,
          sku: product.sku,
          approvalStatus: product.approvalStatus,
          canAdd: true,
          canEdit: false,
        },
      )
    }

    if (!product.inventory) {
      throw httpError('Inventory missing for this product', 400, 'InventoryRequired')
    }

    const check = assertListedWithinWarehouse(product.inventory, requested)
    if (!check.ok) {
      throw new AppError(
        `Listed quantity cannot exceed warehouse stock (${check.warehouseStock}). You tried: ${requested}.`,
        400,
        'InsufficientStock',
        {
          warehouseStock: check.warehouseStock,
          listedQuantity: Number(product.inventory.listedQuantity ?? 0),
          remainingListable: Math.max(
            0,
            check.warehouseStock - Number(product.inventory.listedQuantity ?? 0),
          ),
          maxListableTotal: check.warehouseStock,
          requestedQuantity: requested,
          unitOfMeasure: 'bag',
        },
      )
    }

    const { sharedData, mediaCreates, featureRows, tierCreates } =
      buildListingParts(body, files)

    const nextStatus =
      product.approvalStatus === 'REJECTED'
        ? 'REJECTED'
        : 'PENDING_REVIEW'

    // Rejected edits keep listedQuantity at 0 until resubmit
    const listedUpdate =
      nextStatus === 'REJECTED'
        ? { listedQuantity: 0 }
        : { listedQuantity: requested }

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        ...sharedData,
        approvalStatus: nextStatus,
        ...(nextStatus === 'PENDING_REVIEW' ? { rejectionReason: null } : {}),
        inventory: { update: listedUpdate },
        features: { deleteMany: {}, create: featureRows },
        pricingTiers: { deleteMany: {}, create: tierCreates },
        ...(mediaCreates.length
          ? { media: { deleteMany: {}, create: mediaCreates } }
          : {}),
      },
      select: {
        ...shortSelect,
        rejectionReason: true,
        inventory: {
          select: { currentStock: true, listedQuantity: true },
        },
      },
    })

    const after = getStockBreakdown(updated.inventory, updated.approvalStatus)
    return {
      status: 200,
      body: {
        id: updated.id,
        sku: updated.sku,
        title: updated.title,
        approvalStatus: updated.approvalStatus,
        rejectionReason: updated.rejectionReason,
        ...after,
        listingQuota: await getListingQuota(auth.id),
        message:
          nextStatus === 'REJECTED'
            ? 'Product updated. Click Resubmit when you are ready for review.'
            : 'Product updated and submitted for review',
      },
    }
  }

  /**
   * Resubmit REJECTED product for admin review.
   * Same editable fields as Edit (title, qty, prices, text, images, bulk…).
   * Locked: sku, categoryId, subCategoryId, productTypeId.
   */
  async resubmit(auth, productId, body, files = {}, _baseUrl) {
    this.assertSupplier(auth)

    const product = await prisma.product.findFirst({
      where: { id: productId, sellerId: auth.id },
      select: {
        id: true,
        sku: true,
        title: true,
        approvalStatus: true,
        inventory: {
          select: { id: true, currentStock: true, listedQuantity: true },
        },
      },
    })

    if (!product) throw httpError('Product not found', 404, 'NotFound')
    if (product.approvalStatus !== 'REJECTED') {
      throw httpError(
        'Only rejected products can be resubmitted',
        400,
        'NotRejected',
      )
    }
    if (!product.inventory) {
      throw httpError('Inventory missing for this product', 400, 'InventoryRequired')
    }

    const requested = Number(body.quantity)
    if (!(requested > 0)) {
      throw new AppError('Quantity must be greater than 0', 400, 'InvalidQuantity')
    }

    const check = assertListedWithinWarehouse(product.inventory, requested)
    if (!check.ok) {
      throw new AppError(
        `You can list at most ${check.warehouseStock} bag(s). You tried: ${requested}.`,
        400,
        'InsufficientStock',
        {
          warehouseStock: check.warehouseStock,
          listedQuantity: 0,
          remainingListable: check.warehouseStock,
          maxListableTotal: check.warehouseStock,
          requestedQuantity: requested,
          unitOfMeasure: 'bag',
        },
      )
    }

    await assertCanSubmitListing(auth.id, {
      productId: product.id,
      alreadyListed: false,
    })

    const { sharedData, mediaCreates, featureRows, tierCreates } =
      buildListingParts(body, files)

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        ...sharedData,
        approvalStatus: 'PENDING_REVIEW',
        rejectionReason: null,
        inventory: { update: { listedQuantity: requested } },
        features: { deleteMany: {}, create: featureRows },
        pricingTiers: { deleteMany: {}, create: tierCreates },
        ...(mediaCreates.length
          ? { media: { deleteMany: {}, create: mediaCreates } }
          : {}),
      },
      select: {
        ...shortSelect,
        rejectionReason: true,
        inventory: {
          select: { currentStock: true, listedQuantity: true },
        },
      },
    })

    const after = getStockBreakdown(updated.inventory, updated.approvalStatus)
    return {
      status: 200,
      body: {
        id: updated.id,
        sku: updated.sku,
        title: updated.title,
        approvalStatus: updated.approvalStatus,
        rejectionReason: null,
        ...after,
        listingQuota: await getListingQuota(auth.id),
        message: 'Product resubmitted for review',
      },
    }
  }

  /** Supplier product management list (tabs + pagination). */
  async list(auth, query, baseUrl) {
    this.assertSupplier(auth)

    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12))
    const skip = (page - 1) * limit
    const tab = String(query.tab || 'all').toLowerCase()
    const search = query.search?.trim() || ''

    const where = {
      sellerId: auth.id,
      inventory: { isNot: null },
      // Product Management: exclude pure inventory (APPROVED + not listed yet)
      OR: [
        { approvalStatus: { in: ['PENDING_REVIEW', 'REJECTED', 'DRAFT'] } },
        {
          approvalStatus: 'APPROVED',
          inventory: { listedQuantity: { gt: 0 } },
        },
      ],
    }
    const and = []

    if (tab === 'pending') {
      delete where.OR
      where.approvalStatus = 'PENDING_REVIEW'
    } else if (tab === 'rejected') {
      delete where.OR
      where.approvalStatus = 'REJECTED'
    } else if (tab === 'regular') {
      delete where.OR
      where.approvalStatus = 'APPROVED'
      where.marketplaceTier = 'RETAIL'
      where.isFeatured = false
      where.isSponsored = false
      where.inventory = { listedQuantity: { gt: 0 } }
    } else if (tab === 'bulk') {
      delete where.OR
      where.approvalStatus = 'APPROVED'
      where.marketplaceTier = 'WHOLESALE'
      where.isFeatured = false
      where.isSponsored = false
      where.inventory = { listedQuantity: { gt: 0 } }
    } else if (tab === 'featured') {
      delete where.OR
      where.approvalStatus = 'APPROVED'
      and.push({ OR: [{ isFeatured: true }, { isSponsored: true }] })
    }

    if (query.categoryId) {
      and.push({
        OR: [
          { categoryId: query.categoryId },
          { category: { parentCategoryId: query.categoryId } },
          {
            category: {
              parentCategory: { parentCategoryId: query.categoryId },
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

    if (and.length) where.AND = and

    const [total, rows, counts] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.getTabCounts(auth.id),
    ])

    return {
      status: 200,
      body: {
        products: rows.map((p) => mapProduct(p, baseUrl)),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        counts,
        message: 'Products fetched',
      },
    }
  }

  async getTabCounts(sellerId) {
    const listedApproved = {
      sellerId,
      approvalStatus: 'APPROVED',
      inventory: { listedQuantity: { gt: 0 } },
    }
    const [
      all,
      pending,
      rejected,
      regular,
      bulk,
      featured,
    ] = await Promise.all([
      prisma.product.count({
        where: {
          sellerId,
          inventory: { isNot: null },
          OR: [
            { approvalStatus: { in: ['PENDING_REVIEW', 'REJECTED', 'DRAFT'] } },
            {
              approvalStatus: 'APPROVED',
              inventory: { listedQuantity: { gt: 0 } },
            },
          ],
        },
      }),
      prisma.product.count({
        where: { sellerId, approvalStatus: 'PENDING_REVIEW' },
      }),
      prisma.product.count({
        where: { sellerId, approvalStatus: 'REJECTED' },
      }),
      prisma.product.count({
        where: {
          ...listedApproved,
          marketplaceTier: 'RETAIL',
          isFeatured: false,
          isSponsored: false,
        },
      }),
      prisma.product.count({
        where: {
          ...listedApproved,
          marketplaceTier: 'WHOLESALE',
          isFeatured: false,
          isSponsored: false,
        },
      }),
      prisma.product.count({
        where: {
          sellerId,
          approvalStatus: 'APPROVED',
          OR: [{ isFeatured: true }, { isSponsored: true }],
        },
      }),
    ])

    return { all, pending, rejected, regular, bulk, featured }
  }

  /**
   * Supplier cancels a pending listing → releases listedQuantity back to warehouse pool.
   */
  async cancelListing(auth, productId) {
    this.assertSupplier(auth)

    const product = await prisma.product.findFirst({
      where: { id: productId, sellerId: auth.id },
      select: {
        id: true,
        sku: true,
        approvalStatus: true,
        inventory: {
          select: { currentStock: true, listedQuantity: true },
        },
      },
    })

    if (!product) {
      throw httpError('Product not found', 404, 'NotFound')
    }

    if (product.approvalStatus !== 'PENDING_REVIEW') {
      throw httpError(
        'Only pending listings can be cancelled',
        400,
        'NotPending',
      )
    }

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        // Back to inventory-ready (no admin needed)
        approvalStatus: 'APPROVED',
        rejectionReason: null,
        inventory: {
          update: { listedQuantity: 0 },
        },
      },
      select: {
        id: true,
        sku: true,
        title: true,
        approvalStatus: true,
        inventory: {
          select: { currentStock: true, listedQuantity: true },
        },
      },
    })

    const after = getStockBreakdown(updated.inventory, updated.approvalStatus)

    return {
      status: 200,
      body: {
        id: updated.id,
        sku: updated.sku,
        title: updated.title,
        approvalStatus: updated.approvalStatus,
        ...after,
        message:
          'Listing cancelled. Stock is back in inventory — you can list again anytime.',
      },
    }
  }

  /** Admin: approve product listing */
  async approveListing(productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        approvalStatus: true,
        inventory: { select: { currentStock: true, listedQuantity: true } },
      },
    })
    if (!product) throw httpError('Product not found', 404, 'NotFound')
    if (product.approvalStatus !== 'PENDING_REVIEW') {
      throw httpError('Only pending products can be approved', 400, 'NotPending')
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        approvalStatus: 'APPROVED',
        rejectionReason: null,
      },
      select: {
        ...shortSelect,
        rejectionReason: true,
        inventory: {
          select: { currentStock: true, listedQuantity: true },
        },
      },
    })

    return {
      status: 200,
      body: {
        id: updated.id,
        sku: updated.sku,
        title: updated.title,
        approvalStatus: updated.approvalStatus,
        ...getStockBreakdown(updated.inventory, updated.approvalStatus),
        message: 'Product approved',
      },
    }
  }

  /**
   * Admin reject — releases listedQuantity so supplier can edit + resubmit.
   */
  async rejectListing(productId, reason = null) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, approvalStatus: true },
    })
    if (!product) throw httpError('Product not found', 404, 'NotFound')
    if (product.approvalStatus !== 'PENDING_REVIEW') {
      throw httpError('Only pending products can be rejected', 400, 'NotPending')
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        approvalStatus: 'REJECTED',
        rejectionReason: reason?.trim() || null,
        inventory: { update: { listedQuantity: 0 } },
      },
      select: {
        ...shortSelect,
        rejectionReason: true,
        inventory: {
          select: { currentStock: true, listedQuantity: true },
        },
      },
    })

    return {
      status: 200,
      body: {
        id: updated.id,
        sku: updated.sku,
        title: updated.title,
        approvalStatus: updated.approvalStatus,
        rejectionReason: updated.rejectionReason,
        ...getStockBreakdown(updated.inventory, updated.approvalStatus),
        message: 'Listing rejected. Supplier can edit and resubmit.',
      },
    }
  }

  /** Admin: list products for moderation */
  async adminList(query, baseUrl) {
    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12))
    const skip = (page - 1) * limit
    const status = query.status || 'PENDING_REVIEW'

    const where = {}
    if (status !== 'all') where.approvalStatus = status

    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: {
          ...productInclude,
          seller: { select: { id: true, name: true, email: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ])

    return {
      status: 200,
      body: {
        products: rows.map((p) => ({
          ...mapProduct(p, baseUrl),
          seller: p.seller,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        message: 'Admin products fetched',
      },
    }
  }
}

export default new ProductService()
