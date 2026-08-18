import prisma from '../../../../lib/prisma.js'
import { httpError } from '../../../shared/errors.js'
import { categoryFilter } from '../../../shared/catalog.js'
import { parsePagination, paginationMeta } from '../../../shared/pagination.js'
import {
  liveListingWhere,
  marketplaceListInclude,
  marketplaceDetailInclude,
} from '../../listings/includes.js'
import {
  resolveBuyerView,
  mapMarketplaceListProduct,
  mapMarketplaceDetailProduct,
  marketplaceViewer,
} from '../../listings/marketplace.mapper.js'

class MarketplaceService {
  async list(auth, query, baseUrl) {
    const buyer = resolveBuyerView(auth)
    const { page, limit, skip } = parsePagination(query, { defaultLimit: 12 })
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

    const and = [liveListingWhere()]

    if (query.sponsored === true) {
      and.push({ isSponsored: true })
    } else if (query.sponsored === false) {
      and.push({ isSponsored: false })
    }

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

    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: marketplaceListInclude,
        orderBy: [
          { isSponsored: 'desc' },
          { isFeatured: 'desc' },
          { updatedAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
    ])

    return {
      status: 200,
      body: {
        products: rows.map((p) => mapMarketplaceListProduct(p, baseUrl, buyer)),
        pagination: paginationMeta({ page, limit, total }),
        viewer: marketplaceViewer(buyer),
        filters: {
          categoryId: categoryId || null,
          category: categoryName || null,
          search: search || null,
          sponsored: query.sponsored ?? null,
        },
        message: 'Marketplace products fetched',
      },
    }
  }

  async getById(auth, productId, baseUrl) {
    const buyer = resolveBuyerView(auth)

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        ...liveListingWhere(),
      },
      include: marketplaceDetailInclude,
    })

    if (!product) {
      throw httpError('Product not found', 404, 'NotFound')
    }

    return {
      status: 200,
      body: {
        product: mapMarketplaceDetailProduct(product, baseUrl, buyer),
        viewer: marketplaceViewer(buyer),
        message: 'Product details fetched',
      },
    }
  }
}

export default new MarketplaceService()
