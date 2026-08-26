import { money, formatMoney } from '../../shared/money.js'
import { publicSlug } from '../../shared/slug.js'
import { mapCategoryNode, categoryPathStrict } from '../../shared/catalog.js'
import { featureTexts, mapProductMedia, marketplaceAvailability } from './read.js'

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

export function resolveBuyerView(auth) {
  const role = String(auth?.role || '').toLowerCase()
  const isCompany = role === 'company'
  return {
    role: role || 'guest',
    isCompany,
    isAuthenticated: Boolean(auth?.id),
  }
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

/**
 * Card / list item.
 * Guest & customer: retail fields only (no B2B keys).
 * Company: basePrice + b2bPrice / min order.
 */
export function mapMarketplaceListProduct(product, baseUrl, buyer) {
  const { bannerImage } = mapProductMedia(product, baseUrl)
  const path = categoryPathStrict(product)
  const seller = mapSeller(product)
  const unit = unitLabel(product)
  const description =
    product.longDescription || product.shortDescription || ''

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
    pricingView: buyer.isCompany ? 'company' : 'retail',
  }

  if (!buyer.isCompany) {
    return base
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
    minOrderLabel: minQty != null ? `Min: ${minQty} ${unit}` : null,
    minB2bQuantity: minQty,
  }
}

/**
 * Detail — retail/customer vs company.
 * Without company token: no B2B keys and no below-basePrice bulk tiers.
 */
export function mapMarketplaceDetailProduct(product, baseUrl, buyer) {
  const { bannerImage, images, gallery } = mapProductMedia(product, baseUrl)
  const path = categoryPathStrict(product)
  const seller = mapSeller(product)
  const { availability, availabilityLabel } = marketplaceAvailability(product)
  const unit = unitLabel(product)
  const basePrice = money(product.basePrice)
  const allBulk = mapBulkOptions(product)
  const bulkOptions = buyer.isCompany
    ? allBulk
    : allBulk.filter((tier) => tier.price >= basePrice)
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
    basePrice,
    priceLabel: priceLabel(product),
    unitOfMeasure: unit,
    weightKg: product.weightKg,
    bulkOptions,
    pricingTable: bulkOptions.map((t) => ({
      buy:
        t.maxQuantity != null
          ? `${t.minQuantity} - ${t.maxQuantity}`
          : `${t.minQuantity}+`,
      price: t.priceLabel,
      unitPrice: t.price,
    })),
    bannerImage,
    images,
    gallery,
    description: product.longDescription || null,
    additionalInfo: product.shortDescription || null,
    specifications: product.specifications || null,
    features: featureTexts(product),
    store: seller,
    seller,
    isSponsored: Boolean(product.isSponsored),
    isFeatured: Boolean(product.isFeatured),
    reviews: (product.reviews || []).map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      author: r.author ? { id: r.author.id, name: r.author.name } : null,
    })),
    pricingView: buyer.isCompany ? 'company' : 'retail',
    actions: {
      addToCart: true,
      buyNow: true,
      ...(buyer.isCompany ? { sendQuote: true } : {}),
    },
  }

  if (!buyer.isCompany) {
    return shared
  }

  const hasB2b = product.b2bPrice != null
  return {
    ...shared,
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
  }
}

export function marketplaceViewer(buyer) {
  return {
    role: buyer.role,
    isCompany: buyer.isCompany,
    isAuthenticated: buyer.isAuthenticated,
    pricingView: buyer.isCompany ? 'company' : 'retail',
  }
}
