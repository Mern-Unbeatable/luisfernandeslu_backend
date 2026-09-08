import prisma from '../../../lib/prisma.js'
import {
  EDIT_MODULES,
  editCode,
  moduleIdsFromCodes,
  viewCode,
} from '../admin/roles-permissions/catalog.js'

/**
 * Resolve staff role + enabled module permissions for an ADMIN user.
 * - No bridge → full admin (all modules)
 * - ADMIN bridge → full admin
 * - MODERATOR bridge → filtered modules
 */
export async function getAdminStaffAccess(userId) {
  if (!userId) {
    return {
      staffRole: null,
      permissions: [],
      isFullAdmin: false,
    }
  }

  const bridge = await prisma.userAdminRoleBridge.findFirst({
    where: { userId },
    include: {
      adminRole: {
        select: {
          name: true,
          permissions: {
            include: { permission: { select: { code: true } } },
          },
        },
      },
    },
  })

  if (!bridge) {
    return {
      staffRole: 'admin',
      permissions: EDIT_MODULES.map((item) => item.id),
      isFullAdmin: true,
    }
  }

  const roleName = String(bridge.adminRole?.name || '').toUpperCase()
  if (roleName === 'ADMIN') {
    return {
      staffRole: 'admin',
      permissions: EDIT_MODULES.map((item) => item.id),
      isFullAdmin: true,
    }
  }

  const codes = (bridge.adminRole?.permissions || []).map(
    (row) => row.permission.code,
  )

  return {
    staffRole: 'moderator',
    permissions: moduleIdsFromCodes(codes),
    isFullAdmin: false,
  }
}

export function attachStaffAccessToUser(user, staffAccess) {
  if (!user) return user
  return {
    ...user,
    staffRole: staffAccess.staffRole,
    permissions: staffAccess.permissions,
    isFullAdmin: staffAccess.isFullAdmin,
  }
}

export { EDIT_MODULES, editCode, viewCode }
