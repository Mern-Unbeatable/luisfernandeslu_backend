import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'

function httpError(message, status = 400, code = 'Error') {
  return new AppError(message, status, code)
}

function mapCategoryNode(node) {
  if (!node) return null
  return { id: node.id, name: node.name, slug: node.slug }
}

/** root | subcategory | productType */
function catalogLevel(cat) {
  if (!cat?.parentCategoryId) return 'category'
  if (!cat.parentCategory?.parentCategoryId) return 'subcategory'
  return 'productType'
}

function resolveStatus(promo) {
  const now = Date.now()
  if (new Date(promo.expiryDate).getTime() < now) return 'expired'
  if (!promo.isActive) return 'disabled'
  return 'active'
}

function mapPromoCode(promo) {
  const categories = []
  const subCategories = []
  const productTypes = []

  for (const bridge of promo.applicableCategories || []) {
    const node = mapCategoryNode(bridge.category)
    if (!node) continue
    const level = catalogLevel(bridge.category)
    if (level === 'category') categories.push(node)
    else if (level === 'subcategory') subCategories.push(node)
    else productTypes.push(node)
  }

  return {
    id: promo.id,
    code: promo.code,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    minOrderAmount: promo.minOrderAmount,
    usageLimit: promo.usageLimit,
    unlimited: promo.usageLimit == null,
    usedCount: promo.usedCount,
    remainingUses:
      promo.usageLimit == null
        ? null
        : Math.max(0, promo.usageLimit - promo.usedCount),
    expiryDate: promo.expiryDate,
    isActive: promo.isActive,
    applicableUsers: promo.applicableUsers,
    status: resolveStatus(promo),
    products: (promo.applicableProducts || []).map((b) => ({
      id: b.product.id,
      sku: b.product.sku,
      title: b.product.title,
    })),
    categories,
    subCategories,
    productTypes,
    createdAt: promo.createdAt,
    updatedAt: promo.updatedAt,
  }
}

const promoInclude = {
  applicableProducts: {
    include: {
      product: { select: { id: true, sku: true, title: true } },
    },
  },
  applicableCategories: {
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          parentCategoryId: true,
          parentCategory: {
            select: { id: true, parentCategoryId: true },
          },
        },
      },
    },
  },
}

function collectCatalogIds(body) {
  return [
    ...new Set([
      ...(body.categoryIds || []),
      ...(body.subCategoryIds || []),
      ...(body.productTypeIds || []),
    ]),
  ]
}

function hasAnyScope(body) {
  return Boolean(
    body.productIds?.length ||
      body.categoryIds?.length ||
      body.subCategoryIds?.length ||
      body.productTypeIds?.length,
  )
}

export class PromoCodeService {
  assertSupplier(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    if (auth.role !== 'supplier') {
      throw httpError('Only suppliers can manage promo codes', 403, 'Forbidden')
    }
  }

  async assertOwnedProducts(sellerId, productIds) {
    if (!productIds?.length) return
    const found = await prisma.product.findMany({
      where: { sellerId, id: { in: productIds } },
      select: { id: true },
    })
    if (found.length !== productIds.length) {
      throw httpError(
        'One or more products were not found in your catalog',
        400,
        'InvalidProducts',
      )
    }
  }

  /**
   * Validate catalog IDs match the intended level:
   * category = root, subcategory = mid, productType = leaf.
   */
  async assertCatalogScopes({
    categoryIds = [],
    subCategoryIds = [],
    productTypeIds = [],
  }) {
    const allIds = [
      ...new Set([...categoryIds, ...subCategoryIds, ...productTypeIds]),
    ]
    if (!allIds.length) return

    const rows = await prisma.category.findMany({
      where: { id: { in: allIds } },
      select: {
        id: true,
        name: true,
        parentCategoryId: true,
        parentCategory: { select: { parentCategoryId: true } },
      },
    })
    if (rows.length !== allIds.length) {
      throw httpError(
        'One or more categories / subcategories / types were not found',
        400,
        'InvalidCategories',
      )
    }

    const byId = new Map(rows.map((r) => [r.id, r]))

    for (const id of categoryIds) {
      if (catalogLevel(byId.get(id)) !== 'category') {
        throw httpError(
          `ID ${id} is not a root category`,
          400,
          'InvalidCategoryLevel',
        )
      }
    }
    for (const id of subCategoryIds) {
      if (catalogLevel(byId.get(id)) !== 'subcategory') {
        throw httpError(
          `ID ${id} is not a subcategory`,
          400,
          'InvalidSubCategoryLevel',
        )
      }
    }
    for (const id of productTypeIds) {
      if (catalogLevel(byId.get(id)) !== 'productType') {
        throw httpError(
          `ID ${id} is not a product type`,
          400,
          'InvalidProductTypeLevel',
        )
      }
    }
  }

  normalizeUsageLimit(body) {
    if (body.unlimited === true || body.usageLimit == null) return null
    return Number(body.usageLimit)
  }

  async create(auth, body) {
    this.assertSupplier(auth)

    const productIds = [...new Set(body.productIds || [])]
    const categoryIds = [...new Set(body.categoryIds || [])]
    const subCategoryIds = [...new Set(body.subCategoryIds || [])]
    const productTypeIds = [...new Set(body.productTypeIds || [])]
    const catalogIds = collectCatalogIds({
      categoryIds,
      subCategoryIds,
      productTypeIds,
    })

    await Promise.all([
      this.assertOwnedProducts(auth.id, productIds),
      this.assertCatalogScopes({
        categoryIds,
        subCategoryIds,
        productTypeIds,
      }),
    ])

    try {
      const promo = await prisma.promoCode.create({
        data: {
          sellerId: auth.id,
          code: body.code,
          discountType: body.discountType,
          discountValue: body.discountValue,
          minOrderAmount: body.minOrderAmount ?? 0,
          usageLimit: this.normalizeUsageLimit(body),
          expiryDate: body.expiryDate,
          applicableUsers: body.applicableUsers || 'ALL',
          isActive: true,
          applicableProducts: productIds.length
            ? {
                create: productIds.map((productId) => ({ productId })),
              }
            : undefined,
          applicableCategories: catalogIds.length
            ? {
                create: catalogIds.map((categoryId) => ({ categoryId })),
              }
            : undefined,
        },
        include: promoInclude,
      })

      return {
        status: 201,
        body: {
          promoCode: mapPromoCode(promo),
          message: 'Promo code created',
        },
      }
    } catch (err) {
      if (err?.code === 'P2002') {
        throw httpError('Promo code already exists', 409, 'CodeExists')
      }
      throw err
    }
  }

  async list(auth, query) {
    this.assertSupplier(auth)

    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
    const skip = (page - 1) * limit
    const status = String(query.status || 'all').toLowerCase()
    const scope = String(query.scope || 'all').toLowerCase()
    const search = query.search?.trim() || ''
    const productId = query.productId || null

    const where = { sellerId: auth.id }
    const now = new Date()

    if (status === 'active') {
      where.isActive = true
      where.expiryDate = { gte: now }
    } else if (status === 'disabled') {
      where.isActive = false
    } else if (status === 'expired') {
      where.expiryDate = { lt: now }
    }

    if (scope === 'product') {
      // Promo codes created for specific product(s)
      where.applicableProducts = { some: {} }
    } else if (scope === 'catalog') {
      // Promo codes for category / subcategory / type only
      where.applicableCategories = { some: {} }
      where.applicableProducts = { none: {} }
    }

    if (productId) {
      where.applicableProducts = {
        some: { productId },
      }
    }

    if (search) {
      where.code = { contains: search, mode: 'insensitive' }
    }

    const [total, rows] = await Promise.all([
      prisma.promoCode.count({ where }),
      prisma.promoCode.findMany({
        where,
        include: promoInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ])

    return {
      status: 200,
      body: {
        promoCodes: rows.map(mapPromoCode),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        filters: {
          status,
          scope: productId ? 'product' : scope,
          productId,
          search: search || null,
        },
        message: 'Promo codes fetched',
      },
    }
  }

  async getById(auth, id) {
    this.assertSupplier(auth)
    const promo = await prisma.promoCode.findFirst({
      where: { id, sellerId: auth.id },
      include: promoInclude,
    })
    if (!promo) throw httpError('Promo code not found', 404, 'NotFound')
    return {
      status: 200,
      body: {
        promoCode: mapPromoCode(promo),
        message: 'Promo code fetched',
      },
    }
  }

  async update(auth, id, body) {
    this.assertSupplier(auth)

    const existing = await prisma.promoCode.findFirst({
      where: { id, sellerId: auth.id },
      select: { id: true },
    })
    if (!existing) throw httpError('Promo code not found', 404, 'NotFound')

    const productIds =
      body.productIds !== undefined ? [...new Set(body.productIds || [])] : null
    const categoryIds =
      body.categoryIds !== undefined
        ? [...new Set(body.categoryIds || [])]
        : null
    const subCategoryIds =
      body.subCategoryIds !== undefined
        ? [...new Set(body.subCategoryIds || [])]
        : null
    const productTypeIds =
      body.productTypeIds !== undefined
        ? [...new Set(body.productTypeIds || [])]
        : null

    const catalogTouched =
      categoryIds !== null ||
      subCategoryIds !== null ||
      productTypeIds !== null

    if (productIds) await this.assertOwnedProducts(auth.id, productIds)
    if (catalogTouched) {
      await this.assertCatalogScopes({
        categoryIds: categoryIds || [],
        subCategoryIds: subCategoryIds || [],
        productTypeIds: productTypeIds || [],
      })
    }

    if (
      (productIds !== null || catalogTouched) &&
      !hasAnyScope({
        productIds: productIds || [],
        categoryIds: categoryIds || [],
        subCategoryIds: subCategoryIds || [],
        productTypeIds: productTypeIds || [],
      })
    ) {
      throw httpError(
        'Select at least one product, category, subcategory, or product type',
        400,
        'ScopeRequired',
      )
    }

    const catalogIds = catalogTouched
      ? collectCatalogIds({
          categoryIds: categoryIds || [],
          subCategoryIds: subCategoryIds || [],
          productTypeIds: productTypeIds || [],
        })
      : null

    const data = {}
    if (body.code !== undefined) data.code = body.code
    if (body.discountType !== undefined) data.discountType = body.discountType
    if (body.discountValue !== undefined) data.discountValue = body.discountValue
    if (body.minOrderAmount !== undefined) {
      data.minOrderAmount = body.minOrderAmount
    }
    if (body.expiryDate !== undefined) data.expiryDate = body.expiryDate
    if (body.applicableUsers !== undefined) {
      data.applicableUsers = body.applicableUsers
    }
    if (body.unlimited === true) data.usageLimit = null
    else if (body.usageLimit !== undefined) data.usageLimit = body.usageLimit

    try {
      const promo = await prisma.$transaction(async (tx) => {
        if (productIds) {
          await tx.promoCodeProductBridge.deleteMany({
            where: { promoCodeId: id },
          })
          if (productIds.length) {
            await tx.promoCodeProductBridge.createMany({
              data: productIds.map((productId) => ({
                promoCodeId: id,
                productId,
              })),
            })
          }
        }
        if (catalogIds) {
          await tx.promoCodeCategoryBridge.deleteMany({
            where: { promoCodeId: id },
          })
          if (catalogIds.length) {
            await tx.promoCodeCategoryBridge.createMany({
              data: catalogIds.map((categoryId) => ({
                promoCodeId: id,
                categoryId,
              })),
            })
          }
        }

        return tx.promoCode.update({
          where: { id },
          data,
          include: promoInclude,
        })
      })

      return {
        status: 200,
        body: {
          promoCode: mapPromoCode(promo),
          message: 'Promo code updated',
        },
      }
    } catch (err) {
      if (err?.code === 'P2002') {
        throw httpError('Promo code already exists', 409, 'CodeExists')
      }
      throw err
    }
  }

  async setStatus(auth, id, isActive) {
    this.assertSupplier(auth)
    const existing = await prisma.promoCode.findFirst({
      where: { id, sellerId: auth.id },
      select: { id: true },
    })
    if (!existing) throw httpError('Promo code not found', 404, 'NotFound')

    const promo = await prisma.promoCode.update({
      where: { id },
      data: { isActive: Boolean(isActive) },
      include: promoInclude,
    })

    return {
      status: 200,
      body: {
        promoCode: mapPromoCode(promo),
        message: isActive ? 'Promo code activated' : 'Promo code disabled',
      },
    }
  }

  async remove(auth, id) {
    this.assertSupplier(auth)
    const existing = await prisma.promoCode.findFirst({
      where: { id, sellerId: auth.id },
      select: { id: true },
    })
    if (!existing) throw httpError('Promo code not found', 404, 'NotFound')

    await prisma.promoCode.delete({ where: { id } })
    return {
      status: 200,
      body: { id, message: 'Promo code deleted' },
    }
  }
}

export default new PromoCodeService()
