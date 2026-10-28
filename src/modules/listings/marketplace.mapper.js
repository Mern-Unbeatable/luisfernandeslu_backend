import { money, formatMoney } from '../../shared/money.js'
import { publicSlug } from '../../shared/slug.js'
import { mapCategoryNode, categoryPathStrict } from '../../shared/catalog.js'
import { featureTexts, mapProductMedia, marketplaceAvailability } from './read.js'
import { isSellerPayable } from '../payments/seller-eupago.js'

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

function hasVisibleBulkOption(product, buyer) {
  const basePrice = money(product.basePrice)
  const allBulk = mapBulkOptions(product)
  if (!allBulk.length) return false
  if (buyer.isCompany) return true
  return allBulk.some((tier) => tier.price >= basePrice)
}

export function resolveBuyerView(auth) {
  const role = String(auth?.role || '').toLowerCase()
  const isCompany = role === 'company'
  return {
    id: auth?.id || null,
    role: role || 'guest',
    isCompany,
    isAuthenticated: Boolean(auth?.id),
  }
}

const CART_ROLES = new Set(['guest', 'customer', 'company'])

function canUseCart(buyer) {
  return CART_ROLES.has(buyer?.role)
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
 * Card / list item — raw values only; frontend formats currency/labels.
 * Guest/customer: retail `price`; `b2bPrice` is always present as null.
 * Company: retail `price` + `b2bPrice` when set (else null).
 */
export function mapMarketplaceListProduct(product, baseUrl, buyer) {
  const { bannerImage } = mapProductMedia(product, baseUrl)
  const unit = unitLabel(product)
  const seller = mapSeller(product)
  const rawDescription =
    product.shortDescription || product.longDescription || ''
  const description =
    rawDescription.length > 120
      ? `${rawDescription.slice(0, 117).trim()}...`
      : rawDescription

  const price = money(product.basePrice)
  const weightKg =
    product.weightKg != null && Number(product.weightKg) > 0
      ? Number(product.weightKg)
      : null
  const minQty = buyer.isCompany
    ? product.minB2bQuantity ?? product.minOrderQuantity ?? null
    : product.minOrderQuantity ?? null
  const minOrder =
    minQty != null && Number(minQty) > 0 ? Number(minQty) : null

  const isFactory = product.seller?.role === 'FACTORY'

  const row = {
    id: product.id,
    slug: publicSlug(product.slug),
    image: bannerImage?.url || null,
    title: product.title,
    description,
    price,
    b2bPrice:
      buyer.isCompany && product.b2bPrice != null
        ? money(product.b2bPrice)
        : null,
    unit,
    weightKg,
    company: seller.name,
    rating: Number(product.averageRating ?? 0),
    isSponsored: Boolean(product.isSponsored),
    minOrder,
    hasBulkOption: !isFactory && hasVisibleBulkOption(product, buyer),
    purchasable: !isFactory && isSellerPayable(product.seller),
    isFactory,
  }

  return row
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
  const purchasable = isSellerPayable(product.seller)

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
    purchasable,
    actions: {
      addToCart: purchasable && canUseCart(buyer),
      buyNow: purchasable && canUseCart(buyer),
      ...(buyer.isCompany ||
      (buyer.role === 'supplier' && product.sellerId !== buyer.id)
        ? { sendQuote: true }
        : {}),
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
      minQty != null ? `Minimum Order ${minQty} ${unit}` : null,
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
