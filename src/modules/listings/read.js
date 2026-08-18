import { absolutizeUrl } from '../../lib/requestUrl.js'
import { getStockBreakdown } from '../../shared/stock-listing.js'

export function mapProductMedia(product, baseUrl, { bannerKey = 'bannerImage' } = {}) {
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

  if (bannerKey === 'banner') {
    return {
      banner: bannerImage,
      images,
      gallery,
      image: bannerImage?.url || images[0]?.url || null,
    }
  }

  return { bannerImage, images, gallery }
}

export function stockAvailability(stock, threshold = 10) {
  if (stock <= 0) {
    return {
      availability: 'OUT_OF_STOCK',
      availabilityLabel: 'Out of Stock',
      stockStatus: 'OUT_OF_STOCK',
    }
  }
  if (stock <= threshold) {
    return {
      availability: 'LOW_STOCK',
      availabilityLabel: 'Low Stock',
      stockStatus: 'LOW_STOCK',
    }
  }
  return {
    availability: 'IN_STOCK',
    availabilityLabel: 'In Stock',
    stockStatus: 'IN_STOCK',
  }
}

/** Supplier / inventory: warehouse stock drives availability. */
export function warehouseAvailability(product) {
  const stockInfo = getStockBreakdown(product.inventory, product.approvalStatus)
  const threshold = product.inventory?.lowStockThreshold ?? 10
  return {
    ...stockInfo,
    ...stockAvailability(stockInfo.warehouseStock, threshold),
    threshold,
  }
}

/**
 * Marketplace live listing: sellable stock is the overlap of listed bags
 * and warehouse bags.
 */
export function marketplaceAvailability(product) {
  const listed = Number(product.inventory?.listedQuantity ?? 0)
  const warehouse = Number(product.inventory?.currentStock ?? 0)
  const stock = Math.min(listed, warehouse)
  const threshold = product.inventory?.lowStockThreshold ?? 10
  return { stock, ...stockAvailability(stock, threshold) }
}

export function b2bDiscountPercent(basePrice, b2bPrice) {
  if (b2bPrice != null && basePrice > 0) {
    return Number((((basePrice - b2bPrice) / basePrice) * 100).toFixed(2))
  }
  return 0
}

/** Supplier + factory owner UIs historically format with a dollar sign. */
export function dollarPriceLabel(product) {
  return `$${Number(product.basePrice).toFixed(2)} Per ${
    product.unitOfMeasure || 'bag'
  }${product.weightKg ? ` ( ${product.weightKg}kg )` : ''}`
}

export function featureTexts(product) {
  return (product.features || []).map((f) => f.featureText)
}
