/** Staff RBAC catalog — module ids map to admin sidebar pages. */

export const INVITE_ROLES = [
  { value: 'moderator', name: 'Moderator' },
]

/** @deprecated use INVITE_ROLES — kept for AdminRole seed (ADMIN + MODERATOR) */
export const STAFF_ROLES = [
  { value: 'admin', name: 'Admin' },
  { value: 'moderator', name: 'Moderator' },
]

export const EDIT_MODULES = [
  { id: 'dashboard-overview', module: 'Dashboard / Overview', defaultEnabled: true },
  { id: 'user-management', module: 'User Management', defaultEnabled: false },
  { id: 'supplier-management', module: 'Supplier Management', defaultEnabled: true },
  { id: 'factory-management', module: 'Factory Management', defaultEnabled: true },
  { id: 'transporter-management', module: 'Transporter Management', defaultEnabled: false },
  { id: 'product-moderation', module: 'Product Moderation', defaultEnabled: true },
  { id: 'chat', module: 'Chat', defaultEnabled: false },
  { id: 'marketing-management', module: 'Marketing Management', defaultEnabled: false },
  { id: 'promotion-plans', module: 'Promotion Plans', defaultEnabled: false },
  { id: 'finance-payments', module: 'Finance & Payments', defaultEnabled: false },
  { id: 'disputes', module: 'Disputes Resolution', defaultEnabled: false },
  { id: 'auction', module: 'Auction', defaultEnabled: false },
  { id: 'orders', module: 'Orders', defaultEnabled: false },
  { id: 'delivery-logistics', module: 'Delivery & Logistics', defaultEnabled: false },
  { id: 'affiliate-directory', module: 'Affiliate Directory', defaultEnabled: false },
  { id: 'settings', module: 'Settings', defaultEnabled: false },
]

export function editCode(id) {
  return `edit:${id}`
}

export function viewCode(id) {
  return `view:${id}`
}

export function adminRoleName(value) {
  const key = String(value || '').trim().toLowerCase()
  if (key === 'admin') return 'ADMIN'
  return 'MODERATOR'
}

export function staffRoleLabel(value) {
  const row = STAFF_ROLES.find((item) => item.value === value)
  return row?.name || 'Moderator'
}

/** Module ids enabled by a set of permission codes. */
export function moduleIdsFromCodes(codes = []) {
  const assigned = new Set(codes)
  return EDIT_MODULES.filter(
    (item) =>
      assigned.has(editCode(item.id)) || assigned.has(viewCode(item.id)),
  ).map((item) => item.id)
}
