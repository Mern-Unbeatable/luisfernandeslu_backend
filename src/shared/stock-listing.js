/**
 * Warehouse stock vs marketplace listing quantity.
 * currentStock   = physical warehouse (inventory / restock)
 * listedQuantity = bags committed while PENDING_REVIEW or marketplace-APPROVED
 * remainingListable = warehouse − listed
 *
 * Inventory create → APPROVED with listedQuantity 0 (no admin).
 * Marketplace listing starts only after Add Product → PENDING_REVIEW.
 */

export const ACTIVE_LISTING_STATUSES = ['PENDING_REVIEW', 'APPROVED']

/** True when SKU occupies a marketplace listing (pending review or live with listed stock). */
export function isMarketplaceListed(approvalStatus, inventory) {
  if (approvalStatus === 'PENDING_REVIEW') return true
  if (
    approvalStatus === 'APPROVED' &&
    Number(inventory?.listedQuantity ?? 0) > 0
  ) {
    return true
  }
  return false
}

export function getStockBreakdown(inventory, approvalStatus) {
  const warehouseStock = Number(inventory?.currentStock ?? 0)
  const rawListed = Number(inventory?.listedQuantity ?? 0)
  const listedQuantity = isMarketplaceListed(approvalStatus, inventory)
    ? rawListed
    : 0
  const remainingListable = Math.max(0, warehouseStock - listedQuantity)

  return {
    warehouseStock,
    listedQuantity,
    remainingListable,
    maxListableTotal: warehouseStock,
  }
}

/** listed total must be ≤ warehouse stock */
export function assertListedWithinWarehouse(inventory, requestedListed) {
  const warehouseStock = Number(inventory?.currentStock ?? 0)
  if (requestedListed > warehouseStock) {
    return {
      ok: false,
      warehouseStock,
      requestedQuantity: requestedListed,
    }
  }
  return { ok: true, warehouseStock, requestedQuantity: requestedListed }
}

export default {
  getStockBreakdown,
  assertListedWithinWarehouse,
  isMarketplaceListed,
  ACTIVE_LISTING_STATUSES,
}
