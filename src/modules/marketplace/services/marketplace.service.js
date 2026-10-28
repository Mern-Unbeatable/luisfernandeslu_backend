import prisma from '../../../../lib/prisma.js'
import { httpError } from '../../../shared/errors.js'
import { categoryFilter } from '../../../shared/catalog.js'
import { parsePagination, paginationMeta } from '../../../shared/pagination.js'
import {
  factoryCatalogWhere,
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

const CANCELLED = 'CANCELLED'

class MarketplaceService {
  async resolveCategory(query) {
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

    return { categoryId, categoryName }
  }

  /** Suppliers also browse factory products; everyone else only sees supplier listings. */
  catalogScope(buyer) {
    if (buyer?.role === 'supplier') {
      return { OR: [liveListingWhere(), factoryCatalogWhere] }
    }
    return liveListingWhere()
  }

  /** A supplier never sees his own products in the storefront. */
  excludeOwnProducts(viewer) {
    if (viewer?.role !== 'supplier' || !viewer.id) return null
    return { sellerId: { not: viewer.id } }
  }

  buildCatalogWhere(query, { categoryId, forceSponsored, buyer, viewer = buyer } = {}) {
    const and = [this.catalogScope(buyer)]
    const ownFilter = this.excludeOwnProducts(viewer)
    if (ownFilter) and.push(ownFilter)
    const search = query.search?.trim() || ''

    if (forceSponsored === true) {
      and.push({ isSponsored: true })
    }

    if (categoryId) {
      and.push({ OR: categoryFilter(categoryId) })
    }

    if (search) {
      and.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { shortDescription: { contains: search, mode: 'insensitive' } },
          { category: { name: { contains: search, mode: 'insensitive' } } },
          { category: { parentCategory: { name: { contains: search, mode: 'insensitive' } } } },
          { category: { parentCategory: { parentCategory: { name: { contains: search, mode: 'insensitive' } } } } },
        ],
      })
    }

    const minPrice = query.minPrice
    const maxPrice = query.maxPrice
    if (minPrice != null || maxPrice != null) {
      const price = {}
      if (minPrice != null) price.gte = Number(minPrice)
      if (maxPrice != null) price.lte = Number(maxPrice)
      and.push({ basePrice: price })
    }

    return { where: { AND: and }, search }
  }

  async listSponsored(auth, query, baseUrl) {
    const buyer = resolveBuyerView(auth)
    const { page, limit, skip } = parsePagination(query, { defaultLimit: 8 })
    const { where } = this.buildCatalogWhere(query, { forceSponsored: true, viewer: buyer })

    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: marketplaceListInclude,
        orderBy: [{ isFeatured: 'desc' }, { updatedAt: 'desc' }],
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
        message: 'Sponsored products fetched',
      },
    }
  }

  async listTopSelling(auth, query, baseUrl) {
    const buyer = resolveBuyerView(auth)
    const { page, limit, skip } = parsePagination(query, { defaultLimit: 12 })
    const ownFilter = this.excludeOwnProducts(buyer)
    const live = ownFilter ? { AND: [liveListingWhere(), ownFilter] } : liveListingWhere()

    const [soldGroups, rows] = await Promise.all([
      prisma.orderLineItem.groupBy({
        by: ['productId'],
        where: {
          product: live,
          order: { orderStatus: { not: CANCELLED } },
        },
        _sum: { quantity: true },
      }),
      prisma.product.findMany({
        where: live,
        include: marketplaceListInclude,
      }),
    ])

    const soldMap = new Map(
      soldGroups.map((row) => [row.productId, Number(row._sum.quantity || 0)]),
    )

    rows.sort((a, b) => {
      const soldDiff = (soldMap.get(b.id) || 0) - (soldMap.get(a.id) || 0)
      if (soldDiff !== 0) return soldDiff
      const ratingDiff = Number(b.averageRating || 0) - Number(a.averageRating || 0)
      if (ratingDiff !== 0) return ratingDiff
      return Number(b.reviewCount || 0) - Number(a.reviewCount || 0)
    })

    const total = rows.length
    const pageRows = rows.slice(skip, skip + limit)

    return {
      status: 200,
      body: {
        products: pageRows.map((p) =>
          mapMarketplaceListProduct(p, baseUrl, buyer),
        ),
        pagination: paginationMeta({ page, limit, total }),
        viewer: marketplaceViewer(buyer),
        message: 'Top selling products fetched',
      },
    }
  }

  async list(auth, query, baseUrl) {
    const buyer = resolveBuyerView(auth)
    const { page, limit, skip } = parsePagination(query, { defaultLimit: 12 })
    const { categoryId, categoryName } = await this.resolveCategory(query)
    const { where, search } = this.buildCatalogWhere(query, { categoryId, buyer })

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
          minPrice: query.minPrice ?? null,
          maxPrice: query.maxPrice ?? null,
        },
        message: 'Marketplace products fetched',
      },
    }
  }

  async getSuggestions(auth, query, baseUrl) {
    const q = String(query.q || query.search || '').trim()
    if (!q) {
      return {
        status: 200,
        body: {
          products: [],
          categories: [],
          message: 'Empty query',
        },
      }
    }

    const buyer = resolveBuyerView(auth)
    const ownFilter = this.excludeOwnProducts(buyer)
    const and = [
      this.catalogScope(buyer),
      ...(ownFilter ? [ownFilter] : []),
      {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
          { shortDescription: { contains: q, mode: 'insensitive' } },
          { category: { name: { contains: q, mode: 'insensitive' } } },
          { category: { parentCategory: { name: { contains: q, mode: 'insensitive' } } } },
        ],
      },
    ]

    const [products, categories] = await Promise.all([
      prisma.product.findMany({
        where: { AND: and },
        include: {
          media: { orderBy: { sortOrder: 'asc' }, take: 2 },
          category: { select: { id: true, name: true, slug: true } },
          seller: { select: { role: true } },
        },
        orderBy: [{ isFeatured: 'desc' }, { updatedAt: 'desc' }],
        take: 5,
      }),
      prisma.category.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          slug: true,
        },
        take: 4,
      }),

    ])

    const mappedProducts = products.map((p) => {
      const publicProductSlug = p.slug?.includes('__') ? p.slug.split('__').pop() : p.slug
      const firstMedia = p.media?.[0]
      const imageUrl = firstMedia
        ? (firstMedia.mediaUrl?.startsWith('http') ? firstMedia.mediaUrl : `${baseUrl}${firstMedia.mediaUrl}`)
        : null

      return {
        id: p.id,
        title: p.title,
        slug: publicProductSlug,
        sku: p.sku,
        basePrice: Number(p.basePrice) || 0,
        unitOfMeasure: p.unitOfMeasure || 'bag',
        image: imageUrl,
        category: p.category ? { id: p.category.id, name: p.category.name, slug: p.category.slug } : null,
        isFactory: p.seller?.role === 'FACTORY',
      }
    })

    return {
      status: 200,
      body: {
        products: mappedProducts,
        categories,
        message: 'Suggestions fetched',
      },
    }
  }

  async getBySlug(auth, slugParam, baseUrl) {
    const buyer = resolveBuyerView(auth)
    const slug = String(slugParam || '')
      .trim()
      .toLowerCase()
    if (!slug) throw httpError('Product not found', 404, 'NotFound')

    const product = await prisma.product.findFirst({
      where: {
        AND: [
          liveListingWhere(),
          {
            OR: [{ slug }, { slug: { endsWith: `__${slug}` } }],
          },
        ],
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

