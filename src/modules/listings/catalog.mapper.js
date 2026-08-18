import { absolutizeUrl } from '../../lib/requestUrl.js'
import { env } from '../../config/env.js'
import { money } from '../../shared/money.js'
import { publicSlug } from '../../shared/slug.js'
import { mapCategoryNode, categoryPathNodes } from '../../shared/catalog.js'
import { companyDisplayName as factoryName } from '../../shared/party.js'
import { mapProductMedia } from './read.js'

const CURRENCY = env.currency

function priceText(product) {
  const unit = product.unitOfMeasure || 'unit'
  const weight =
    product.weightKg && Number(product.weightKg) > 0
      ? ` (${product.weightKg} kg)`
      : ''
  const symbol = CURRENCY === 'EUR' ? '€' : `${CURRENCY} `
  return `Price: ${symbol}${money(product.basePrice)} per ${unit}${weight}`
}

export function mapFactoryCatalogListItem(product, baseUrl) {
  const media = mapProductMedia(product, baseUrl, { bannerKey: 'banner' })
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

export function mapFactoryCatalogDetail(product, baseUrl) {
  const media = mapProductMedia(product, baseUrl, { bannerKey: 'banner' })
  const path = categoryPathNodes(product.category)
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

export { CURRENCY }
