import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'

/**
 * Inventory SKU count vs marketplace listings.
 * Slot used only by PENDING_REVIEW, or APPROVED with listedQuantity > 0.
 * Pure inventory (APPROVED + listedQuantity 0) does not consume a slot.
 */
export async function getListingQuota(sellerId, excludeProductId = null) {
  const baseSeller = { sellerId }
  const exclude = excludeProductId ? { id: { not: excludeProductId } } : {}

  const [inventoryCount, activeListings] = await Promise.all([
    prisma.product.count({
      where: {
        ...baseSeller,
        inventory: { isNot: null },
      },
    }),
    prisma.product.count({
      where: {
        ...baseSeller,
        ...exclude,
        OR: [
          { approvalStatus: 'PENDING_REVIEW' },
          {
            approvalStatus: 'APPROVED',
            inventory: { listedQuantity: { gt: 0 } },
          },
        ],
      },
    }),
  ])

  const remaining = Math.max(0, inventoryCount - activeListings)

  return {
    inventoryCount,
    activeListings,
    remaining,
    canList: remaining > 0,
  }
}

/**
 * New marketplace listing needs a free slot.
 * Re-saving an already marketplace-listed product does not consume a new slot.
 */
export async function assertCanSubmitListing(
  sellerId,
  { productId = null, alreadyListed = false } = {},
) {
  if (productId && alreadyListed) {
    return getListingQuota(sellerId, productId)
  }

  const quota = await getListingQuota(sellerId, productId || null)

  if (!quota.canList) {
    throw new AppError(
      `Listing limit reached (${quota.activeListings}/${quota.inventoryCount}). Cancel a pending listing, wait for admin reject, or add more inventory SKUs.`,
      400,
      'ListingQuotaExceeded',
      {
        listingQuota: {
          inventoryCount: quota.inventoryCount,
          activeListings: quota.activeListings,
          remaining: 0,
          canList: false,
        },
      },
    )
  }

  return quota
}

export default { getListingQuota, assertCanSubmitListing }
