import { mapProductMedia } from '../listings/read.js'

function productDescription(product) {
  if (!product) return null
  const raw = product.shortDescription || product.longDescription || null
  if (!raw) return null
  return raw.length > 160 ? `${raw.slice(0, 157).trim()}...` : raw
}

export function mapPendingReviewItem(line, baseUrl) {
  const product = line.product
  const { bannerImage, images } = mapProductMedia(product || {}, baseUrl)

  return {
    id: line.id,
    orderId: line.order?.id || null,
    orderNumber: line.order?.orderNumber || null,
    productId: line.productId,
    image: bannerImage?.url || images[0]?.url || null,
    title: product?.title || null,
    description: productDescription(product),
    shippingStatus: 'delivered',
    orderStatus: line.order?.orderStatus || null,
    deliveredAt: line.order?.updatedAt || null,
  }
}

export function mapCreatedReview(review) {
  return {
    id: review.id,
    productId: review.productId,
    rating: review.rating,
    comment: review.comment || null,
    createdAt: review.createdAt,
  }
}
