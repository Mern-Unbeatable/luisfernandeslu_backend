import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'

function slugify(input) {
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
}

function httpError(message, status = 400, code = 'Error') {
  return new AppError(message, status, code)
}

function publicSlug(slug) {
  if (!slug) return slug
  const parts = String(slug).split('__')
  return parts[parts.length - 1]
}

async function resolveCategoryPath(productTypeId) {
  // Lean select — less data over remote DB link
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

  if (!productType?.parentCategory?.parentCategory) {
    return null
  }

  const subCategory = productType.parentCategory
  const category = subCategory.parentCategory

  if (category.parentCategoryId !== null) {
    return null
  }

  return { category, subCategory, productType }
}

function mapInventoryProduct(product) {
  const stock = product.inventory?.currentStock ?? 0
  const threshold = product.inventory?.lowStockThreshold ?? 10
  let stockStatus = 'IN_STOCK'
  if (stock <= 0) stockStatus = 'OUT_OF_STOCK'
  else if (stock <= threshold) stockStatus = 'LOW_STOCK'

  const path = product._categoryPath

  return {
    id: product.id,
    inventoryId: product.inventory?.id ?? null,
    name: product.title,
    sku: product.sku,
    price: product.basePrice,
    quantity: stock,
    unitOfMeasure: product.unitOfMeasure,
    factoryName: product.factoryName,
    warehouseLocation: product.warehouseLocation,
    lowStockThreshold: threshold,
    stockStatus,
    stockValue: Number((stock * product.basePrice).toFixed(2)),
    approvalStatus: product.approvalStatus,
    category: path
      ? {
          id: path.category.id,
          slug: publicSlug(path.category.slug),
          name: path.category.name,
        }
      : null,
    subCategory: path
      ? {
          id: path.subCategory.id,
          slug: publicSlug(path.subCategory.slug),
          name: path.subCategory.name,
        }
      : null,
    productType: path
      ? {
          id: path.productType.id,
          slug: publicSlug(path.productType.slug),
          name: path.productType.name,
        }
      : {
          id: product.categoryId,
          slug: null,
          name: product.category?.name ?? null,
        },
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  }
}

export class InventoryService {
  async assertSupplier(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    if (auth.role !== 'supplier') {
      throw httpError('Only suppliers can manage inventory', 403, 'Forbidden')
    }
  }

  async create(auth, body) {
    await this.assertSupplier(auth)

    const sku = String(body.sku).trim()
    // Unique slug without extra DB round-trips (remote DB latency dominates)
    const slug = `${slugify(body.name) || 'product'}-${Date.now().toString(36)}`

    const path = await resolveCategoryPath(body.productTypeId)
    if (!path) {
      throw httpError('Invalid product type', 400, 'InvalidProductType')
    }
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

    let product
    try {
      // Single nested create is already atomic — skip interactive $transaction
      // (extra round-trips on remote Postgres).
      product = await prisma.product.create({
        data: {
          sellerId: auth.id,
          categoryId: body.productTypeId,
          sku,
          title: body.name.trim(),
          slug,
          factoryName: body.factoryName.trim(),
          basePrice: body.price,
          unitOfMeasure: body.unitOfMeasure || 'tons',
          weightKg: 0,
          warehouseLocation: body.warehouseLocation.trim(),
          approvalStatus: 'PENDING_REVIEW',
          inventory: {
            create: {
              currentStock: body.quantity,
              lowStockThreshold: body.lowStockThreshold ?? 10,
              transactions: {
                create: {
                  quantityChange: body.quantity,
                  sourceType: 'INITIAL',
                },
              },
            },
          },
        },
        include: {
          inventory: true,
        },
      })
    } catch (err) {
      if (err?.code === 'P2002') {
        const target = err?.meta?.target
        const fields = Array.isArray(target) ? target.join(',') : String(target || '')
        if (fields.includes('sku')) {
          throw httpError('SKU already exists', 409, 'SkuExists')
        }
        throw httpError('Product already exists', 409, 'Duplicate')
      }
      throw err
    }

    product._categoryPath = path

    return {
      status: 201,
      body: {
        product: mapInventoryProduct(product),
        message: 'Inventory product created',
      },
    }
  }

  async list(auth, query) {
    await this.assertSupplier(auth)

    const page = query.page || 1
    const limit = query.limit || 20
    const skip = (page - 1) * limit

    const where = {
      sellerId: auth.id,
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
              { factoryName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: {
          inventory: true,
          category: {
            include: {
              parentCategory: {
                include: { parentCategory: true },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ])

    const mapped = products.map((p) => {
      const productType = p.category
      const subCategory = productType?.parentCategory
      const category = subCategory?.parentCategory
      p._categoryPath =
        category && subCategory && productType
          ? { category, subCategory, productType }
          : null
      return mapInventoryProduct(p)
    })

    return {
      status: 200,
      body: {
        products: mapped,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
        message: 'Inventory products fetched',
      },
    }
  }

  async getStats(auth) {
    await this.assertSupplier(auth)

    const products = await prisma.product.findMany({
      where: { sellerId: auth.id },
      select: {
        basePrice: true,
        inventory: {
          select: {
            currentStock: true,
            lowStockThreshold: true,
          },
        },
      },
    })

    let totalStockValue = 0
    let lowStockItems = 0
    let outOfStock = 0

    for (const p of products) {
      const stock = p.inventory?.currentStock ?? 0
      const threshold = p.inventory?.lowStockThreshold ?? 10
      totalStockValue += stock * p.basePrice
      if (stock <= 0) outOfStock += 1
      else if (stock <= threshold) lowStockItems += 1
    }

    return {
      status: 200,
      body: {
        stats: {
          totalProducts: products.length,
          totalStockValue: Number(totalStockValue.toFixed(2)),
          lowStockItems,
          outOfStock,
        },
        message: 'Inventory stats fetched',
      },
    }
  }

  async restock(auth, inventoryProductId, body) {
    await this.assertSupplier(auth)

    const product = await prisma.product.findFirst({
      where: { id: inventoryProductId, sellerId: auth.id },
      include: { inventory: true },
    })

    if (!product?.inventory) {
      throw httpError('Inventory product not found', 404, 'NotFound')
    }

    const updated = await prisma.$transaction(async (tx) => {
      const inv = await tx.inventory.update({
        where: { id: product.inventory.id },
        data: {
          currentStock: { increment: body.quantity },
        },
      })

      await tx.inventoryTransaction.create({
        data: {
          inventoryId: inv.id,
          quantityChange: body.quantity,
          sourceType: 'RESTOCK',
        },
      })

      return tx.product.findUnique({
        where: { id: product.id },
        include: {
          inventory: true,
          category: {
            include: {
              parentCategory: {
                include: { parentCategory: true },
              },
            },
          },
        },
      })
    })

    const productType = updated.category
    const subCategory = productType?.parentCategory
    const category = subCategory?.parentCategory
    updated._categoryPath =
      category && subCategory && productType
        ? { category, subCategory, productType }
        : null

    return {
      status: 200,
      body: {
        product: mapInventoryProduct(updated),
        message: 'Stock updated',
      },
    }
  }

  async remove(auth, inventoryProductId) {
    await this.assertSupplier(auth)

    const product = await prisma.product.findFirst({
      where: { id: inventoryProductId, sellerId: auth.id },
      select: { id: true },
    })

    if (!product) {
      throw httpError('Inventory product not found', 404, 'NotFound')
    }

    await prisma.product.delete({ where: { id: product.id } })

    return {
      status: 200,
      body: {
        message: 'Inventory product deleted',
      },
    }
  }
}

export default new InventoryService()
