import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'
import { generateProductCopy } from '../../../lib/ai.js'
import { downloadRemoteProductImage } from '../../../shared/upload/product-upload.js'
import { assertCanSubmitListing, getListingQuota } from '../../../shared/listing-quota.js'
import {
  getStockBreakdown,
  assertListedWithinWarehouse,
  isMarketplaceListed,
} from '../../../shared/stock-listing.js'
import {
  parseCsv,
  buildProductCsvTemplate,
  decodeCsvBuffer,
  PRODUCT_CSV_HEADERS,
} from '../../../shared/csv.js'
import { buildCategoryGuidePdf } from '../../../shared/pdf/catalog-guide-pdf.js'
import { createProductBodySchema } from '../validations/product.validation.js'
import { httpError } from '../../../shared/errors.js'
import { categoryFilter } from '../../../shared/catalog.js'
import {
  assertCategoryPath,
  resolveCategoryPathByNames,
} from '../../../shared/catalog.query.js'
import { parsePagination, paginationMeta } from '../../../shared/pagination.js'
import {
  supplierListingParts,
  uniqueProductSlug,
  rethrowSkuConflict,
} from '../../listings/write.js'
import { mapProductMedia } from '../../listings/read.js'
import { supplierProductInclude } from '../../listings/includes.js'
import { mapSupplierProduct } from '../../listings/supplier.mapper.js'

const shortSelect = {
  id: true,
  sku: true,
  title: true,
  approvalStatus: true,
}

function moderationStatusLabel(approvalStatus) {
  if (approvalStatus === 'PENDING_REVIEW') return 'Pending'
  if (approvalStatus === 'APPROVED') return 'Approved'
  if (approvalStatus === 'REJECTED') return 'Rejected'
  if (approvalStatus === 'DRAFT') return 'Draft'
  return approvalStatus
}

/** Product Moderation card fields only (Accept / Reject / Details grid). */
function mapAdminProductCard(product, baseUrl) {
  const { bannerImage, images } = mapProductMedia(product, baseUrl)
  return {
    id: product.id,
    status: moderationStatusLabel(product.approvalStatus),
    image: bannerImage?.url || images[0]?.url || null,
    name: product.title,
    description: product.shortDescription || null,
    basePrice: product.basePrice,
    unitOfMeasure: product.unitOfMeasure || 'bag',
    weightKg: product.weightKg || 0,
  }
}

async function resolveAdminCategoryFilter(query) {
  let categoryId = query.categoryId || null
  let categoryName = query.category?.trim() || null

  if (!categoryId && categoryName) {
    const cat = await prisma.category.findFirst({
      where: { name: { equals: categoryName, mode: 'insensitive' } },
      select: { id: true, name: true },
    })
    if (!cat) {
      throw httpError(`Category not found: "${categoryName}"`, 404, 'CategoryNotFound')
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

  return { categoryId, categoryName }
}

function mapCsvRowToBody(row, pathIds) {
  const feature = String(row.feature || '')
    .split(/[;\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n')

  let bulkOptions = row.bulkOptions || ''
  if (bulkOptions && typeof bulkOptions === 'string') {
    try {
      bulkOptions = JSON.parse(bulkOptions)
    } catch {
      // leave string — zod will fail with clear error
    }
  }

  return {
    sku: row.sku,
    title: row.title,
    warehouseLocation: row.warehouseLocation,
    categoryId: pathIds.categoryId,
    subCategoryId: pathIds.subCategoryId,
    productTypeId: pathIds.productTypeId,
    quantity: row.quantity,
    basePrice: row.basePrice,
    b2bDiscount: row.b2bDiscount === '' ? 0 : row.b2bDiscount,
    minB2bQuantity:
      row.minB2bQuantity === '' || row.minB2bQuantity == null
        ? null
        : row.minB2bQuantity,
    weightKg: row.weightKg === '' ? 0 : row.weightKg,
    factoryName: row.factoryName || undefined,
    description: row.description || '',
    feature,
    additionalInfo: row.additionalInfo || '',
    specifications: row.specifications || '',
    bulkEnabled: row.bulkEnabled || false,
    bulkOptions: bulkOptions || [],
  }
}

async function buildCsvFilesFromUrls(sellerId, row) {
  const files = { bannerImage: [], images: [] }
  const bannerUrl = String(row.bannerImageUrl || '').trim()
  if (bannerUrl) {
    files.bannerImage.push(
      await downloadRemoteProductImage(sellerId, bannerUrl, 'banner'),
    )
  }

  const gallery = String(row.imageUrls || '')
    .split(/[;\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10)

  let i = 0
  for (const url of gallery) {
    i += 1
    files.images.push(
      await downloadRemoteProductImage(sellerId, url, `gallery-${i}`),
    )
  }

  return files
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
      include: supplierProductInclude,
    })

    if (!product) {
      throw httpError('No inventory product found for this SKU', 404, 'SkuNotFound')
    }

    const mapped = mapSupplierProduct(product, baseUrl)
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

  /**
   * Product detail page — full info by id (title, rating, stock, bulk, gallery, tabs).
   */
  async getById(auth, productId, baseUrl) {
    this.assertSupplier(auth)

    const product = await prisma.product.findFirst({
      where: { id: productId, sellerId: auth.id },
      include: {
        ...supplierProductInclude,
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            author: { select: { id: true, name: true } },
          },
        },
      },
    })

    if (!product) {
      throw httpError('Product not found', 404, 'NotFound')
    }

    return {
      status: 200,
      body: {
        product: mapSupplierProduct(product, baseUrl),
        message: 'Product details fetched',
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
      supplierListingParts(body, files)

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
      await assertCategoryPath(body)

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
    await assertCategoryPath(body)

    try {
      const product = await prisma.product.create({
        data: {
          ...sharedData,
          seller: { connect: { id: auth.id } },
          category: { connect: { id: body.productTypeId } },
          sku,
          slug: uniqueProductSlug(body.title),
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
      rethrowSkuConflict(err)
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
      supplierListingParts(body, files)

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
      supplierListingParts(body, files)

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

  /** Supplier product management list (tabs + pagination + category filter). */
  async list(auth, query, baseUrl) {
    this.assertSupplier(auth)

    const { page, limit, skip } = parsePagination(query, { defaultLimit: 12 })
    const tab = String(query.tab || 'all').toLowerCase()
    const search = query.search?.trim() || ''

    let categoryId = query.categoryId || null
    let categoryName = query.category?.trim() || null

    if (!categoryId && categoryName) {
      const cat = await prisma.category.findFirst({
        where: {
          name: { equals: categoryName, mode: 'insensitive' },
        },
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
      if (!cat) {
        throw httpError('Category not found', 404, 'CategoryNotFound')
      }
      categoryName = cat.name
    }

    const and = [
      { sellerId: auth.id },
      { inventory: { isNot: null } },
    ]

    // Tab filters
    if (tab === 'pending') {
      and.push({ approvalStatus: 'PENDING_REVIEW' })
    } else if (tab === 'rejected') {
      and.push({ approvalStatus: 'REJECTED' })
    } else if (tab === 'regular') {
      and.push({
        approvalStatus: 'APPROVED',
        marketplaceTier: 'RETAIL',
        isFeatured: false,
        isSponsored: false,
        inventory: { listedQuantity: { gt: 0 } },
      })
    } else if (tab === 'bulk') {
      and.push({
        approvalStatus: 'APPROVED',
        marketplaceTier: 'WHOLESALE',
        isFeatured: false,
        isSponsored: false,
        inventory: { listedQuantity: { gt: 0 } },
      })
    } else if (tab === 'featured') {
      and.push({
        approvalStatus: 'APPROVED',
        OR: [{ isFeatured: true }, { isSponsored: true }],
      })
    } else {
      // all — listed pipeline only (exclude pure inventory stock)
      and.push({
        OR: [
          { approvalStatus: { in: ['PENDING_REVIEW', 'REJECTED', 'DRAFT'] } },
          {
            approvalStatus: 'APPROVED',
            inventory: { listedQuantity: { gt: 0 } },
          },
        ],
      })
    }

    // Category filter (root / subcategory / product-type id all work)
    if (categoryId) {
      and.push({ OR: categoryFilter(categoryId) })
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
        include: supplierProductInclude,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.getTabCounts(auth.id, categoryId),
    ])

    return {
      status: 200,
      body: {
        products: rows.map((p) => mapSupplierProduct(p, baseUrl)),
        pagination: paginationMeta({ page, limit, total }),
        counts,
        filters: {
          tab,
          categoryId: categoryId || null,
          category: categoryName || null,
          search: search || null,
        },
        message: 'Products fetched',
      },
    }
  }

  async getTabCounts(sellerId, categoryId = null) {
    const categoryWhere = categoryId ? { OR: categoryFilter(categoryId) } : null

    const withCategory = (extra) => {
      const parts = [{ sellerId }, ...(categoryWhere ? [categoryWhere] : [])]
      if (extra) parts.push(extra)
      return { AND: parts }
    }

    const listedApprovedExtra = {
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
        where: withCategory({
          inventory: { isNot: null },
          OR: [
            { approvalStatus: { in: ['PENDING_REVIEW', 'REJECTED', 'DRAFT'] } },
            {
              approvalStatus: 'APPROVED',
              inventory: { listedQuantity: { gt: 0 } },
            },
          ],
        }),
      }),
      prisma.product.count({
        where: withCategory({ approvalStatus: 'PENDING_REVIEW' }),
      }),
      prisma.product.count({
        where: withCategory({ approvalStatus: 'REJECTED' }),
      }),
      prisma.product.count({
        where: withCategory({
          ...listedApprovedExtra,
          marketplaceTier: 'RETAIL',
          isFeatured: false,
          isSponsored: false,
        }),
      }),
      prisma.product.count({
        where: withCategory({
          ...listedApprovedExtra,
          marketplaceTier: 'WHOLESALE',
          isFeatured: false,
          isSponsored: false,
        }),
      }),
      prisma.product.count({
        where: withCategory({
          approvalStatus: 'APPROVED',
          OR: [{ isFeatured: true }, { isSponsored: true }],
        }),
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
      select: {
        id: true,
        approvalStatus: true,
        inventory: { select: { id: true } },
      },
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
        // Factory direct products have no inventory row
        ...(product.inventory
          ? { inventory: { update: { listedQuantity: 0 } } }
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

    return {
      status: 200,
      body: {
        id: updated.id,
        sku: updated.sku,
        title: updated.title,
        approvalStatus: updated.approvalStatus,
        rejectionReason: updated.rejectionReason,
        ...getStockBreakdown(updated.inventory, updated.approvalStatus),
        message: 'Listing rejected. Seller can edit and resubmit.',
      },
    }
  }

  /** Admin Product Moderation — single PATCH approve/reject via body.status */
  async adminModerate(productId, body) {
    const next = String(body.status || '').toLowerCase()
    if (next === 'approved') return this.approveListing(productId)
    return this.rejectListing(productId, body.reason)
  }

  /** Admin Product Moderation — card grid (slim payload + category filter). */
  async adminList(query, baseUrl) {
    const { page, limit, skip } = parsePagination(query, { defaultLimit: 12 })
    const status = query.status || 'PENDING_REVIEW'
    const search = query.search?.trim() || ''
    const { categoryId, categoryName } = await resolveAdminCategoryFilter(query)

    const and = []
    if (status !== 'all') and.push({ approvalStatus: status })
    if (categoryId) and.push({ OR: categoryFilter(categoryId) })
    if (search) {
      and.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
        ],
      })
    }
    const where = and.length ? { AND: and } : {}

    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        select: {
          id: true,
          title: true,
          shortDescription: true,
          basePrice: true,
          unitOfMeasure: true,
          weightKg: true,
          approvalStatus: true,
          media: { orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ])

    return {
      status: 200,
      body: {
        products: rows.map((p) => mapAdminProductCard(p, baseUrl)),
        pagination: paginationMeta({ page, limit, total }),
        filters: {
          status,
          categoryId: categoryId || null,
          category: categoryName || null,
          search: search || null,
        },
        message: 'Admin products fetched',
      },
    }
  }

  /** Admin Product Moderation — full product details. */
  async adminGetById(productId, baseUrl) {
    const product = await prisma.product.findFirst({
      where: { id: productId },
      include: {
        ...supplierProductInclude,
        seller: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phoneNumber: true,
          },
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            author: { select: { id: true, name: true } },
          },
        },
      },
    })

    if (!product) throw httpError('Product not found', 404, 'NotFound')

    return {
      status: 200,
      body: {
        product: {
          ...mapSupplierProduct(product, baseUrl),
          status: moderationStatusLabel(product.approvalStatus),
          seller: product.seller,
        },
        message: 'Product details fetched',
      },
    }
  }

  /** Demo CSV template (headers + sample rows). */
  getCsvTemplate() {
    return {
      filename: 'product-upload-template.csv',
      contentType: 'text/csv; charset=utf-8',
      body: '\uFEFF' + buildProductCsvTemplate(),
      headers: PRODUCT_CSV_HEADERS,
    }
  }

  /** PDF guide with exact category / subcategory / product type names for CSV. */
  async getCategoryGuidePdf() {
    const body = await buildCategoryGuidePdf()
    return {
      filename: 'construpreco-csv-category-guide.pdf',
      contentType: 'application/pdf',
      body,
    }
  }

  /**
   * Bulk Add Product from CSV.
   * Each row follows the same rules as POST /api/products (quota, stock, SKU).
   */
  async importCsv(auth, fileBuffer) {
    this.assertSupplier(auth)

    if (!fileBuffer?.length) {
      throw httpError('CSV file is required', 400, 'CsvRequired')
    }

    const text = decodeCsvBuffer(fileBuffer)
    const { headers, records } = parseCsv(text)

    if (!headers.length) {
      throw httpError('CSV is empty or invalid', 400, 'InvalidCsv')
    }

    const missing = PRODUCT_CSV_HEADERS.filter(
      (h) =>
        [
          'sku',
          'title',
          'warehouseLocation',
          'category',
          'subCategory',
          'productType',
          'quantity',
          'basePrice',
        ].includes(h) && !headers.includes(h),
    )
    if (missing.length) {
      throw httpError(
        `CSV is missing required columns: ${missing.join(', ')}`,
        400,
        'MissingColumns',
        { missing, expectedHeaders: PRODUCT_CSV_HEADERS },
      )
    }

    if (!records.length) {
      throw httpError('CSV has headers but no data rows', 400, 'EmptyCsv')
    }

    if (records.length > 100) {
      throw httpError('CSV may contain at most 100 rows per upload', 400, 'TooManyRows')
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
        const parsed = createProductBodySchema.safeParse(raw)
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
        expectedHeaders: PRODUCT_CSV_HEADERS,
        message:
          failed.length === 0
            ? `Imported ${created.length} product(s) successfully`
            : `Imported ${created.length} product(s), ${failed.length} failed`,
      },
    }
  }
}

export default new ProductService()
