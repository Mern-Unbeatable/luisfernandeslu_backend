import prisma from '../../../../lib/prisma.js'
import { getListingQuota } from '../../../shared/listing-quota.js'
import { httpError } from '../../../shared/errors.js'
import {
  assertCategoryPath,
  resolveCategoryPathByNames,
} from '../../../shared/catalog.query.js'
import { parsePagination, paginationMeta } from '../../../shared/pagination.js'
import {
  uniqueProductSlug,
  rethrowSkuConflict,
} from '../../listings/write.js'
import { inventoryListInclude } from '../../listings/includes.js'
import {
  mapInventoryProduct,
  attachInventoryCategoryPath,
} from '../../listings/inventory.mapper.js'

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
    const slug = uniqueProductSlug(body.name)
    const categoryIds = await this.resolveCategoryIds(body)

    let product
    try {
      // Single nested create is already atomic — skip interactive $transaction
      // (extra round-trips on remote Postgres).
      product = await prisma.product.create({
        data: {
          sellerId: auth.id,
          categoryId: categoryIds.productTypeId,
          sku,
          title: body.name.trim(),
          slug,
          factoryName: body.factoryName.trim(),
          basePrice: body.price,
          unitOfMeasure: 'kg',
          weightKg: 0,
          warehouseLocation: body.warehouseLocation.trim(),
          approvalStatus: 'APPROVED',
          inventory: {
            create: {
              currentStock: body.quantity,
              listedQuantity: 0,
              lowStockThreshold: 10,
              transactions: {
                create: {
                  quantityChange: body.quantity,
                  sourceType: 'INITIAL',
                },
              },
            },
          },
        },
        select: {
          id: true,
          sku: true,
          title: true,
          approvalStatus: true,
        },
      })
    } catch (err) {
      rethrowSkuConflict(err, { distinguishDuplicate: true })
    }

    return {
      status: 201,
      body: {
        id: product.id,
        sku: product.sku,
        title: product.title,
        approvalStatus: product.approvalStatus,
        message: 'Inventory product created',
      },
    }
  }

  async resolveCategoryIds(body) {
    if (body.productTypeId && body.categoryId && body.subCategoryId) {
      await assertCategoryPath(body)
      return {
        categoryId: body.categoryId,
        subCategoryId: body.subCategoryId,
        productTypeId: body.productTypeId,
      }
    }

    const byName = await resolveCategoryPathByNames({
      category: body.categoryName,
      subCategory: body.subCategoryName,
      productType: body.productTypeName,
    })

    return {
      categoryId: byName.categoryId,
      subCategoryId: byName.subCategoryId,
      productTypeId: byName.productTypeId,
    }
  }

  async list(auth, query) {
    await this.assertSupplier(auth)

    const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 })

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
        include: inventoryListInclude,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ])

    const mapped = products.map((p) =>
      mapInventoryProduct(attachInventoryCategoryPath(p)),
    )

    return {
      status: 200,
      body: {
        products: mapped,
        pagination: paginationMeta({ page, limit, total }),
        message: 'Inventory products fetched',
      },
    }
  }

  async getById(auth, inventoryProductId) {
    await this.assertSupplier(auth)

    const product = await prisma.product.findFirst({
      where: { id: inventoryProductId, sellerId: auth.id },
      include: inventoryListInclude,
    })

    if (!product) {
      throw httpError('Inventory product not found', 404, 'NotFound')
    }

    return {
      status: 200,
      body: {
        product: mapInventoryProduct(
          attachInventoryCategoryPath(product),
        ),
        message: 'Inventory product fetched',
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

    const listingQuota = await getListingQuota(auth.id)

    return {
      status: 200,
      body: {
        stats: {
          totalProducts: products.length,
          totalStockValue: Number(totalStockValue.toFixed(2)),
          lowStockItems,
          outOfStock,
          listingQuota,
        },
        message: 'Inventory stats fetched',
      },
    }
  }

  async restock(auth, inventoryProductId, body) {
    await this.assertSupplier(auth)

    const product = await prisma.product.findFirst({
      where: { id: inventoryProductId, sellerId: auth.id },
      select: {
        id: true,
        sku: true,
        inventory: { select: { id: true, currentStock: true } },
      },
    })

    if (!product?.inventory) {
      throw httpError('Inventory product not found', 404, 'NotFound')
    }

    const inv = await prisma.inventory.update({
      where: { id: product.inventory.id },
      data: {
        currentStock: { increment: body.quantity },
        transactions: {
          create: {
            quantityChange: body.quantity,
            sourceType: 'RESTOCK',
          },
        },
      },
      select: { currentStock: true },
    })

    return {
      status: 200,
      body: {
        id: product.id,
        sku: product.sku,
        quantity: inv.currentStock,
        message: 'Stock updated',
      },
    }
  }

  async remove(auth, inventoryProductId) {
    await this.assertSupplier(auth)

    const product = await prisma.product.findFirst({
      where: { id: inventoryProductId, sellerId: auth.id },
      select: { id: true, sku: true },
    })

    if (!product) {
      throw httpError('Inventory product not found', 404, 'NotFound')
    }

    await prisma.product.delete({ where: { id: product.id } })

    return {
      status: 200,
      body: {
        id: product.id,
        sku: product.sku,
        message: 'Inventory product deleted',
      },
    }
  }
}

export default new InventoryService()
