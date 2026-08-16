import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'

function httpError(message, status = 400, code = 'Error') {
  return new AppError(message, status, code)
}

function publicSlug(slug) {
  if (!slug) return slug
  const parts = String(slug).split('__')
  return parts[parts.length - 1]
}

function mapCategoryNode(node) {
  if (!node) return null
  return {
    id: node.id,
    slug: publicSlug(node.slug),
    name: node.name,
  }
}

function money(n) {
  return Number(Number(n).toFixed(2))
}

function formatMoney(n) {
  return `$${money(n).toFixed(2)}`
}

function unitLabel(product) {
  return product.unitOfMeasure || 'bag'
}

function priceLabel(product) {
  const unit = unitLabel(product)
  const weight =
    product.weightKg && Number(product.weightKg) > 0
      ? ` ( ${product.weightKg}kg )`
      : ''
  return `${formatMoney(product.basePrice)} Per ${unit}${weight}`
}

function mapBulkOptions(product) {
  return (product.pricingTiers || []).map((t) => ({
    id: t.id,
    minQuantity: t.minQuantity,
    maxQuantity: t.maxQuantity,
    price: money(t.tierPrice),
    priceLabel: formatMoney(t.tierPrice),
    label:
      t.maxQuantity != null
        ? `${t.minQuantity} - ${t.maxQuantity}`
        : `${t.minQuantity}+`,
  }))
}

function resolveBuyerView(auth) {
  const role = String(auth?.role || '').toLowerCase()
  const isCompany = role === 'company'
  return {
    role: role || 'guest',
    isCompany,
    isAuthenticated: Boolean(auth?.id),
  }
}

function mapMedia(product, baseUrl) {
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
  return { bannerImage, images, gallery }
}

function mapSeller(product) {
  const profileName = product.seller?.profile?.companyName?.trim()
  const name =
    profileName ||
    product.factoryName?.trim() ||
    product.seller?.name ||
    'Store'

  return {
    id: product.seller?.id || null,
    name,
    rating: Number(product.averageRating ?? 0),
    reviewCount: Number(product.reviewCount ?? 0),
  }
}

function categoryPathFromProduct(product) {
  if (product.category?.parentCategory?.parentCategory) {
    return {
      productType: product.category,
      subCategory: product.category.parentCategory,
      category: product.category.parentCategory.parentCategory,
    }
  }
  return null
}

function availabilityFromInventory(product) {
  const listed = Number(product.inventory?.listedQuantity ?? 0)
  const warehouse = Number(product.inventory?.currentStock ?? 0)
  const stock = Math.min(listed, warehouse)
  const threshold = product.inventory?.lowStockThreshold ?? 10

  let availability = 'IN_STOCK'
  let availabilityLabel = 'In Stock'
  if (stock <= 0) {
    availability = 'OUT_OF_STOCK'
    availabilityLabel = 'Out of Stock'
  } else if (stock <= threshold) {
    availability = 'LOW_STOCK'
    availabilityLabel = 'Low Stock'
  }

  return { availability, availabilityLabel, stock }
}

/** Live supplier marketplace listing filter */
function liveListingWhere() {
  return {
    approvalStatus: 'APPROVED',
    inventory: {
      is: {
        listedQuantity: { gt: 0 },
      },
    },
  }
}

const listInclude = {
  inventory: true,
  media: { orderBy: { sortOrder: 'asc' } },
  seller: {
    select: {
      id: true,
      name: true,
      profile: { select: { companyName: true } },
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
  pricingTiers: { orderBy: { minQuantity: 'asc' } },
  reviews: {
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      author: { select: { id: true, name: true } },
    },
  },
}

/**
 * Card / list item — image 1 style.
 * Guest & customer: basePrice only.
 * Company: basePrice + b2bPrice.
 */
function mapListProduct(product, baseUrl, buyer) {
  const { bannerImage } = mapMedia(product, baseUrl)
  const path = categoryPathFromProduct(product)
  const seller = mapSeller(product)
  const unit = unitLabel(product)
  const description =
    product.longDescription ||
    product.shortDescription ||
    ''

  const base = {
    id: product.id,
    slug: publicSlug(product.slug),
    title: product.title,
    description:
      description.length > 160
        ? `${description.slice(0, 157).trim()}...`
        : description,
    image: bannerImage?.url || null,
    bannerImage,
    unitOfMeasure: unit,
    basePrice: money(product.basePrice),
    price: formatMoney(product.basePrice),
    priceLabel: priceLabel(product),
    isSponsored: Boolean(product.isSponsored),
    isFeatured: Boolean(product.isFeatured),
    badge: product.isSponsored
      ? { label: 'SPONSORED', type: 'sponsored' }
      : null,
    seller: { id: seller.id, name: seller.name },
    company: seller.name,
    averageRating: Number(product.averageRating ?? 0),
    rating: Number(product.averageRating ?? 0),
    category: mapCategoryNode(path?.category),
    subCategory: mapCategoryNode(path?.subCategory),
    productType: mapCategoryNode(path?.productType || product.category),
  }

  if (!buyer.isCompany) {
    return {
      ...base,
      b2bPrice: null,
      companyPrice: null,
      companyPriceText: null,
      minOrder: null,
      minOrderLabel: null,
      pricingView: 'retail',
    }
  }

  const hasB2b = product.b2bPrice != null
  const minQty = product.minB2bQuantity ?? product.minOrderQuantity ?? null

  return {
    ...base,
    b2bPrice: hasB2b ? money(product.b2bPrice) : null,
    companyPrice: hasB2b ? formatMoney(product.b2bPrice) : null,
    companyPriceText: hasB2b
      ? `Company: ${formatMoney(product.b2bPrice)} /${unit}`
      : null,
    minOrder: minQty != null ? `${minQty} ${unit}` : null,
    minOrderLabel:
      minQty != null ? `Min: ${minQty} ${unit}` : null,
    minB2bQuantity: minQty,
    pricingView: 'company',
  }
}

/**
 * Detail — image 2 (retail/customer) vs image 3 (company).
 */
function mapDetailProduct(product, baseUrl, buyer) {
  const { bannerImage, images, gallery } = mapMedia(product, baseUrl)
  const path = categoryPathFromProduct(product)
  const seller = mapSeller(product)
  const { availability, availabilityLabel } = availabilityFromInventory(product)
  const unit = unitLabel(product)
  const bulkOptions = mapBulkOptions(product)
  const minQty = product.minB2bQuantity ?? product.minOrderQuantity ?? null

  const shared = {
    id: product.id,
    slug: publicSlug(product.slug),
    sku: product.sku,
    title: product.title,
    averageRating: Number(product.averageRating ?? 0),
    reviewCount: Number(product.reviewCount ?? 0),
    availability,
    availabilityLabel,
    category: mapCategoryNode(path?.category),
    subCategory: mapCategoryNode(path?.subCategory),
    productType: mapCategoryNode(path?.productType || product.category),
    basePrice: money(product.basePrice),
    priceLabel: priceLabel(product),
    unitOfMeasure: unit,
    weightKg: product.weightKg,
    bulkOptions,
    pricingTable: bulkOptions.map((t) => ({
      buy: t.maxQuantity != null ? `${t.minQuantity} - ${t.maxQuantity}` : `${t.minQuantity}+`,
      price: t.priceLabel,
      unitPrice: t.price,
    })),
    bannerImage,
    images,
    gallery,
    description: product.longDescription || null,
    additionalInfo: product.shortDescription || null,
    specifications: product.specifications || null,
    features: (product.features || []).map((f) => f.featureText),
    store: seller,
    seller,
    isSponsored: Boolean(product.isSponsored),
    isFeatured: Boolean(product.isFeatured),
    reviews: (product.reviews || []).map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      author: r.author
        ? { id: r.author.id, name: r.author.name }
        : null,
    })),
  }

  if (!buyer.isCompany) {
    // Image 2 — customer / guest / other logged-in roles
    return {
      ...shared,
      pricingView: 'retail',
      b2bPrice: null,
      companyPrice: null,
      companyPriceText: null,
      minOrder: null,
      minOrderLabel: null,
      minB2bQuantity: null,
      showMinimumOrder: false,
      actions: {
        addToCart: true,
        buyNow: true,
        sendQuote: false,
      },
    }
  }

  // Image 3 — company user
  const hasB2b = product.b2bPrice != null
  return {
    ...shared,
    pricingView: 'company',
    b2bPrice: hasB2b ? money(product.b2bPrice) : null,
    companyPrice: hasB2b ? formatMoney(product.b2bPrice) : null,
    companyPriceText: hasB2b
      ? `Company: ${formatMoney(product.b2bPrice)} /${unit}`
      : null,
    minOrder: minQty != null ? `${minQty} ${unit}` : null,
    minOrderLabel:
      minQty != null ? `Minimum Order ${minQty} PCS` : null,
    minB2bQuantity: minQty,
    showMinimumOrder: minQty != null,
    actions: {
      addToCart: true,
      buyNow: true,
      sendQuote: true,
    },
  }
}

class MarketplaceService {
  async list(auth, query, baseUrl) {
    const buyer = resolveBuyerView(auth)
    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12))
    const skip = (page - 1) * limit
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

    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: listInclude,
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
        products: rows.map((p) => mapListProduct(p, baseUrl, buyer)),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        viewer: {
          role: buyer.role,
          isCompany: buyer.isCompany,
          isAuthenticated: buyer.isAuthenticated,
          pricingView: buyer.isCompany ? 'company' : 'retail',
        },
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
      include: detailInclude,
    })

    if (!product) {
      throw httpError('Product not found', 404, 'NotFound')
    }

    return {
      status: 200,
      body: {
        product: mapDetailProduct(product, baseUrl, buyer),
        viewer: {
          role: buyer.role,
          isCompany: buyer.isCompany,
          isAuthenticated: buyer.isAuthenticated,
          pricingView: buyer.isCompany ? 'company' : 'retail',
        },
        message: 'Product details fetched',
      },
    }
  }
}

export default new MarketplaceService()
