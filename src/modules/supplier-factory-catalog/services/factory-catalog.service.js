import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'

function httpError(message, status = 400, code = 'Error', details) {
  return new AppError(message, status, code, details)
}

const CURRENCY = process.env.CART_CURRENCY || 'EUR'

function money(n) {
  return Number(Number(n || 0).toFixed(2))
}

function publicSlug(slug) {
  if (!slug) return slug
  const parts = String(slug).split('__')
  return parts[parts.length - 1]
}

function mapCategoryNode(node) {
  if (!node) return null
  return { id: node.id, slug: publicSlug(node.slug), name: node.name }
}

function categoryPath(category) {
  if (!category) return { category: null, subCategory: null, productType: null }
  const parent = category.parentCategory
  const root = parent?.parentCategory
  if (root) {
    return { category: root, subCategory: parent, productType: category }
  }
  if (parent) {
    return { category: parent, subCategory: category, productType: null }
  }
  return { category, subCategory: null, productType: null }
}

function factoryName(seller) {
  return seller?.profile?.companyName || seller?.name || null
}

function priceText(product) {
  const unit = product.unitOfMeasure || 'unit'
  const weight =
    product.weightKg && Number(product.weightKg) > 0
      ? ` (${product.weightKg} kg)`
      : ''
  const symbol = CURRENCY === 'EUR' ? '€' : `${CURRENCY} `
  return `Price: ${symbol}${money(product.basePrice)} per ${unit}${weight}`
}

function mapMedia(product, baseUrl) {
  const banner =
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

  const gallery = [...(banner ? [banner] : []), ...images]
  return { banner, images, gallery, image: banner?.url || images[0]?.url || null }
}

const catalogWhere = {
  approvalStatus: 'APPROVED',
  seller: { role: 'FACTORY' },
}

const listInclude = {
  media: { orderBy: { sortOrder: 'asc' } },
  seller: {
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      profile: { select: { companyName: true, logoUrl: true } },
    },
  },
  category: {
    include: {
      parentCategory: {
        include: { parentCategory: true },
      },
    },
  },
}

const detailInclude = {
  ...listInclude,
  features: true,
}

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
      where: { id: productId, ...catalogWhere },
      include: detailInclude,
    })
  }

  mapListItem(product, baseUrl) {
    const media = mapMedia(product, baseUrl)
    const description =
      product.shortDescription || product.longDescription || null
    return {
      id: product.id,
      factoryId: product.sellerId,
      factory: {
        id: product.sellerId,
        name: factoryName(product.seller),
      },
      product: {
        image: media.image,
        title: product.title,
        description: description
          ? description.length > 160
            ? `${description.slice(0, 157).trim()}...`
            : description
          : null,
        price: money(product.basePrice),
        unit: product.unitOfMeasure || null,
        weightKg: product.weightKg || null,
        priceText: priceText(product),
        currency: CURRENCY,
      },
      canMessage: true,
      chat: {
        type: 'FACTORY_SUPPLIER',
        productId: product.id,
        factoryId: product.sellerId,
      },
    }
  }

  mapDetail(product, baseUrl) {
    const media = mapMedia(product, baseUrl)
    const path = categoryPath(product.category)
    const factory = {
      id: product.sellerId,
      name: factoryName(product.seller),
      email: product.seller?.email || null,
      phone: product.seller?.phoneNumber || null,
      logoUrl: product.seller?.profile?.logoUrl
        ? absolutizeUrl(product.seller.profile.logoUrl, baseUrl)
        : null,
    }

    return {
      id: product.id,
      factoryId: product.sellerId,
      sku: product.sku,
      slug: publicSlug(product.slug),
      title: product.title,
      description: product.longDescription || product.shortDescription || null,
      additionalInfo: product.shortDescription || null,
      specifications: product.specifications || null,
      factoryName: product.factoryName || factory.name,
      warehouseLocation: product.warehouseLocation || null,
      price: money(product.basePrice),
      unit: product.unitOfMeasure || null,
      weightKg: product.weightKg || null,
      priceText: priceText(product),
      currency: CURRENCY,
      minOrderQuantity: product.minOrderQuantity,
      image: media.image,
      images: media.gallery.map((m) => m.url),
      bannerImage: media.banner,
      gallery: media.gallery,
      category: mapCategoryNode(path.category)?.name || null,
      categoryTree: {
        category: mapCategoryNode(path.category),
        subCategory: mapCategoryNode(path.subCategory),
        productType: mapCategoryNode(path.productType),
      },
      features: (product.features || []).map((f) => f.featureText),
      rating: Number(product.averageRating ?? 0),
      reviewCount: Number(product.reviewCount ?? 0),
      factory,
      seller: factory,
      canMessage: true,
      actions: { sendMessage: true },
      chat: {
        type: 'FACTORY_SUPPLIER',
        productId: product.id,
        factoryId: product.sellerId,
      },
    }
  }

  async list(auth, query, baseUrl) {
    this.assertSupplier(auth)
    const page = Number(query.page) || 1
    const limit = Number(query.limit) || 12
    const skip = (page - 1) * limit
    const search = String(query.search || '').trim()
    const factoryId = String(query.factoryId || '').trim()

    const where = { ...catalogWhere }
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
        include: listInclude,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ])

    return {
      status: 200,
      body: {
        products: rows.map((p) => this.mapListItem(p, baseUrl)),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
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
        product: this.mapDetail(product, baseUrl),
        message: 'Factory product details fetched',
      },
    }
  }
}

export default new SupplierFactoryCatalogService()
