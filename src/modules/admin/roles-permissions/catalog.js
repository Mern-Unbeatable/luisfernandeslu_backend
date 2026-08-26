/** Matches frontend `rolesPermissionsAdminDemo.js` module ids and labels. */

export const STAFF_ROLES = [
  { value: 'admin', name: 'Admin' },
  { value: 'moderator', name: 'Moderator' },
]

export const EDIT_MODULES = [
  { id: 'dashboard-overview', module: 'Dashboard/ Overview', defaultEnabled: false },
  { id: 'product-management', module: 'Product Management', defaultEnabled: true },
  { id: 'supplier-management', module: 'Supplier Management', defaultEnabled: true },
  { id: 'factory-management', module: 'Factory Management', defaultEnabled: true },
  { id: 'transporter-management', module: 'Transporter Management', defaultEnabled: false },
  { id: 'product-moderation', module: 'Product Moderation', defaultEnabled: false },
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
