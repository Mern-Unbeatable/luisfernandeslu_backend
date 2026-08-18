import { productFilePublicUrl } from '../../shared/upload/product-upload.js'
import { slugify } from '../../shared/slug.js'
import { httpError } from '../../shared/errors.js'

export function featureLines(text) {
  return String(text || '')
    .replace(/\\n/g, '\n')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean)
}

export function mediaCreatesFromFiles(files = {}) {
  const bannerFiles = files?.bannerImage || []
  const otherFiles = files?.images || []
  const mediaCreates = []
  if (bannerFiles[0]) {
    mediaCreates.push({
      mediaUrl: productFilePublicUrl(bannerFiles[0]),
      isBanner: true,
      sortOrder: 0,
    })
  }
  otherFiles.forEach((file, index) => {
    mediaCreates.push({
      mediaUrl: productFilePublicUrl(file),
      isBanner: false,
      sortOrder: index + 1,
    })
  })
  return mediaCreates
}

export function uniqueProductSlug(title) {
  return `${slugify(String(title || '').trim()) || 'product'}-${Date.now().toString(36)}`
}

export function rethrowSkuConflict(err, { distinguishDuplicate = false } = {}) {
  if (err?.code !== 'P2002') throw err
  const target = err?.meta?.target
  const fields = Array.isArray(target) ? target.join(',') : String(target || '')
  if (distinguishDuplicate && !fields.includes('sku')) {
    throw httpError('Product already exists', 409, 'Duplicate')
  }
  throw httpError('SKU already exists', 409, 'SkuExists')
}

export function b2bPriceFromDiscount(basePrice, discount) {
  const pct = Number(discount || 0)
  return pct > 0 ? Number((basePrice * (1 - pct / 100)).toFixed(2)) : null
}

/**
 * Shared Prisma write payload for a marketplace / factory listing.
 * `includeB2b` / `includeBulk` are supplier-only; factory listings stay retail.
 */
export function buildListingParts(body, files = {}, options = {}) {
  const {
    factoryName,
    includeB2b = false,
    includeBulk = false,
  } = options

  const mediaCreates = mediaCreatesFromFiles(files)
  const featureRows = featureLines(body.feature).map((featureText) => ({
    featureText,
  }))

  const bulkEnabled = includeBulk && Boolean(body.bulkEnabled)
  const tierCreates = (bulkEnabled ? body.bulkOptions || [] : []).map((t) => ({
    minQuantity: t.minQuantity,
    maxQuantity: t.maxQuantity ?? null,
    tierPrice: t.price,
  }))

  const sharedData = {
    title: body.title.trim(),
    warehouseLocation: body.warehouseLocation.trim(),
    factoryName:
      factoryName !== undefined
        ? factoryName || null
        : body.factoryName?.trim() || null,
    basePrice: body.basePrice,
    b2bPrice: includeB2b
      ? b2bPriceFromDiscount(body.basePrice, body.b2bDiscount)
      : null,
    minB2bQuantity: includeB2b ? body.minB2bQuantity ?? null : null,
    weightKg: body.weightKg ?? 0,
    unitOfMeasure: 'bag',
    longDescription: body.description || null,
    shortDescription: body.additionalInfo || null,
    specifications: body.specifications || null,
    marketplaceTier: bulkEnabled ? 'WHOLESALE' : 'RETAIL',
    approvalStatus: 'PENDING_REVIEW',
    rejectionReason: null,
  }

  return { sharedData, mediaCreates, featureRows, tierCreates }
}

export function supplierListingParts(body, files) {
  return buildListingParts(body, files, { includeB2b: true, includeBulk: true })
}

export function factoryListingParts(body, files, factoryName) {
  return buildListingParts(body, files, { factoryName })
}
