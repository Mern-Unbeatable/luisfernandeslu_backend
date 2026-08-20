import { mapCategoryNode, categoryPathStrict } from '../../shared/catalog.js'
import {
  dollarPriceLabel,
  featureTexts,
  mapProductMedia,
} from './read.js'

function resolveUiStatus(approvalStatus) {
  if (approvalStatus === 'PENDING_REVIEW') return 'pending'
  if (approvalStatus === 'REJECTED') return 'rejected'
  if (approvalStatus === 'DRAFT') return 'draft'
  if (approvalStatus === 'APPROVED') return 'active'
  return String(approvalStatus || '').toLowerCase()
}

/** Factory owner view — no inventory, status is the approval pipeline. */
export function mapFactoryProduct(product, baseUrl, { list = false } = {}) {
  const path = categoryPathStrict(product)
  const { bannerImage, gallery } = mapProductMedia(product, baseUrl)
  const features = featureTexts(product)
  const uiStatus = resolveUiStatus(product.approvalStatus)

  const mapped = {
    id: product.id,
    sku: product.sku,
    title: product.title,
    warehouseLocation: product.warehouseLocation,
    factoryName: product.factoryName,
    basePrice: product.basePrice,
    weightKg: product.weightKg,
    unitOfMeasure: product.unitOfMeasure || 'bag',
    priceLabel: dollarPriceLabel(product),
    description: product.longDescription,
    additionalInfo: product.shortDescription,
    specifications: product.specifications,
    features,
    bannerImage,
    gallery,
    category: mapCategoryNode(path?.category),
    subCategory: mapCategoryNode(path?.subCategory),
    productType: mapCategoryNode(path?.productType || product.category),
    approvalStatus: product.approvalStatus,
    rejectionReason: product.rejectionReason || null,
    status: uiStatus,
    cardStatus: uiStatus,
    hasInventory: false,
    averageRating: Number(product.averageRating ?? 0),
    reviewCount: Number(product.reviewCount ?? 0),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  }

  if (list) {
    const {
      additionalInfo,
      specifications,
      features: _features,
      gallery: _gallery,
      ...rest
    } = mapped
    return rest
  }

  return mapped
}
