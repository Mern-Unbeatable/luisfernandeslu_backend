import { mapCategoryNode, categoryPathStrict } from '../../shared/catalog.js'
import {
  b2bDiscountPercent,
  basePriceLabel,
  featureTexts,
  mapProductMedia,
  warehouseAvailability,
} from './read.js'

function resolveCardStatus(product) {
  if (product.approvalStatus === 'PENDING_REVIEW') return 'pending'
  if (product.approvalStatus === 'REJECTED') return 'rejected'
  if (product.approvalStatus === 'DRAFT') return 'draft'
  if (
    product.approvalStatus === 'APPROVED' &&
    Number(product.inventory?.listedQuantity ?? 0) <= 0
  ) {
    return 'draft'
  }
  if (product.isFeatured || product.isSponsored) return 'featured'
  if (product.marketplaceTier === 'WHOLESALE') return 'bulk'
  return 'regular'
}

function resolvePromotionExpiry(product) {
  const active = (product.promotions || []).find(
    (p) => p.approvalStatus === 'APPROVED' && p.endDate,
  )
  return active?.endDate || null
}

/** Supplier owner view of a marketplace listing. */
export function mapSupplierProduct(product, baseUrl, categoryPath = null) {
  const stockInfo = warehouseAvailability(product)
  const path = categoryPath || categoryPathStrict(product)
  const { bannerImage, images, gallery } = mapProductMedia(product, baseUrl)
  const features = featureTexts(product)

  return {
    id: product.id,
    sku: product.sku,
    title: product.title,
    warehouseLocation: product.warehouseLocation,
    factoryName: product.factoryName,
    quantity: stockInfo.warehouseStock,
    warehouseStock: stockInfo.warehouseStock,
    listedQuantity: stockInfo.listedQuantity,
    remainingListable: stockInfo.remainingListable,
    availability: stockInfo.availability,
    availabilityLabel: stockInfo.availabilityLabel,
    averageRating: Number(product.averageRating ?? 0),
    reviewCount: Number(product.reviewCount ?? 0),
    basePrice: product.basePrice,
    b2bPrice: product.b2bPrice,
    b2bDiscount: b2bDiscountPercent(product.basePrice, product.b2bPrice),
    minB2bQuantity: product.minB2bQuantity,
    weightKg: product.weightKg,
    unitOfMeasure: product.unitOfMeasure || 'bag',
    priceLabel: basePriceLabel(product),
    description: product.longDescription,
    additionalInfo: product.shortDescription,
    specifications: product.specifications,
    feature: features.join('\n'),
    features,
    bulkOptions: (product.pricingTiers || []).map((t) => ({
      id: t.id,
      minQuantity: t.minQuantity,
      maxQuantity: t.maxQuantity,
      price: t.tierPrice,
      label:
        t.maxQuantity != null
          ? `${t.minQuantity} - ${t.maxQuantity}`
          : `${t.minQuantity}+`,
    })),
    bannerImage,
    images,
    gallery,
    category: mapCategoryNode(path?.category),
    subCategory: mapCategoryNode(path?.subCategory),
    productType: mapCategoryNode(path?.productType || product.category),
    approvalStatus: product.approvalStatus,
    rejectionReason: product.rejectionReason || null,
    marketplaceTier: product.marketplaceTier,
    isSponsored: Boolean(product.isSponsored),
    isFeatured: Boolean(product.isFeatured),
    cardStatus: resolveCardStatus(product),
    promotionExpiry: resolvePromotionExpiry(product),
    reviews: (product.reviews || []).map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      author: r.author ? { id: r.author.id, name: r.author.name } : null,
    })),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  }
}
