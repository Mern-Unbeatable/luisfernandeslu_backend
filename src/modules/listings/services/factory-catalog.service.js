import prisma from '../../../../lib/prisma.js'
import { httpError } from '../../../shared/errors.js'
import { parsePagination, paginationMeta } from '../../../shared/pagination.js'
import {
  factoryCatalogWhere,
  factoryCatalogListInclude,
  factoryCatalogDetailInclude,
} from '../includes.js'
import {
  mapFactoryCatalogListItem,
  mapFactoryCatalogDetail,
} from '../catalog.mapper.js'

class SupplierFactoryCatalogService {
  assertSupplier(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    const role = String(auth.role || '').toLowerCase()
    if (role !== 'supplier') {
      throw httpError('Only suppliers can browse factory products', 403, 'Forbidden')
    }
    return auth.id
  }

  async findApprovedFactoryProduct(productId) {
    return prisma.product.findFirst({
      where: { id: productId, ...factoryCatalogWhere },
      include: factoryCatalogDetailInclude,
    })
  }

  async list(auth, query, baseUrl) {
    this.assertSupplier(auth)
    const { page, limit, skip } = parsePagination(query, { defaultLimit: 12 })
    const search = String(query.search || '').trim()
    const factoryId = String(query.factoryId || '').trim()

    const where = { ...factoryCatalogWhere }
    if (factoryId) where.sellerId = factoryId
    if (search) {
      where.AND = [
        {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { factoryName: { contains: search, mode: 'insensitive' } },
            {
              seller: {
                name: { contains: search, mode: 'insensitive' },
              },
            },
            {
              seller: {
                profile: {
                  companyName: { contains: search, mode: 'insensitive' },
                },
              },
            },
          ],
        },
      ]
    }

    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: factoryCatalogListInclude,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ])

    return {
      status: 200,
      body: {
        products: rows.map((p) => mapFactoryCatalogListItem(p, baseUrl)),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Factory products fetched',
      },
    }
  }

  async getById(auth, productId, baseUrl) {
    this.assertSupplier(auth)
    const product = await this.findApprovedFactoryProduct(productId)
    if (!product) throw httpError('Product not found', 404, 'NotFound')

    return {
      status: 200,
      body: {
        product: mapFactoryCatalogDetail(product, baseUrl),
        message: 'Factory product details fetched',
      },
    }
  }
}

export default new SupplierFactoryCatalogService()
