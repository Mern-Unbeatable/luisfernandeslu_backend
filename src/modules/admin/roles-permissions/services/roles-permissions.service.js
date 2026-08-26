import crypto from 'node:crypto'
import prisma from '../../../../../lib/prisma.js'
import { auth } from '../../../../auth/auth.js'
import { env } from '../../../../config/env.js'
import { httpError } from '../../../../shared/errors.js'
import { sendStaffInviteEmail } from '../../../../lib/mail.js'
import {
  EDIT_MODULES,
  STAFF_ROLES,
  adminRoleName,
  editCode,
  staffRoleLabel,
  viewCode,
} from '../catalog.js'

function assertAdmin(authUser) {
  if (!authUser?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(authUser.role || '').toLowerCase() !== 'admin') {
    throw httpError('Admin access required', 403, 'Forbidden')
  }
}

async function assertCanManageStaff(authUser) {
  assertAdmin(authUser)
  const assignment = await prisma.userAdminRoleBridge.findFirst({
    where: { userId: authUser.id },
    include: { adminRole: { select: { name: true } } },
  })
  if (assignment && assignment.adminRole.name !== 'ADMIN') {
    throw httpError('Only an Admin can manage staff roles', 403, 'Forbidden')
  }
}

function codesForEnabled(enabledIds) {
  const enabled = new Set(enabledIds)
  return EDIT_MODULES.flatMap((item) =>
    enabled.has(item.id) ? [editCode(item.id), viewCode(item.id)] : [],
  )
}

let catalogReady = false
let catalogPromise = null

function ensureCatalog() {
  if (catalogReady) return Promise.resolve()
  if (!catalogPromise) {
    catalogPromise = seedCatalogIfNeeded()
      .then(() => {
        catalogReady = true
      })
      .catch((err) => {
        catalogPromise = null
        throw err
      })
  }
  return catalogPromise
}

async function seedCatalogIfNeeded() {
  const existing = await prisma.adminRole.findUnique({
    where: { name: 'MODERATOR' },
    select: {
      id: true,
      permissions: { take: 1, select: { permissionId: true } },
    },
  })
  if (existing?.permissions?.length) return

  const permissionRows = EDIT_MODULES.flatMap((item) => [
    { code: editCode(item.id), description: item.module },
    { code: viewCode(item.id), description: item.module },
  ])
  const roleRows = STAFF_ROLES.map((role) => ({
    name: adminRoleName(role.value),
    description: role.name,
  }))

  await prisma.permission.createMany({
    data: permissionRows,
    skipDuplicates: true,
  })
  await prisma.adminRole.createMany({
    data: roleRows,
    skipDuplicates: true,
  })

  const [moderator, adminRole, allPerms] = await Promise.all([
    prisma.adminRole.findUnique({
      where: { name: 'MODERATOR' },
      select: { id: true },
    }),
    prisma.adminRole.findUnique({
      where: { name: 'ADMIN' },
      select: { id: true },
    }),
    prisma.permission.findMany({
      where: {
        code: { in: permissionRows.map((row) => row.code) },
      },
      select: { id: true, code: true },
    }),
  ])

  const defaults = new Set(
    codesForEnabled(
      EDIT_MODULES.filter((item) => item.defaultEnabled).map((item) => item.id),
    ),
  )
  const ops = []
  if (moderator) {
    ops.push(
      prisma.adminRolePermissionBridge.createMany({
        data: allPerms
          .filter((perm) => defaults.has(perm.code))
          .map((perm) => ({
            adminRoleId: moderator.id,
            permissionId: perm.id,
          })),
        skipDuplicates: true,
      }),
    )
  }
  if (adminRole) {
    ops.push(
      prisma.adminRolePermissionBridge.createMany({
        data: allPerms.map((perm) => ({
          adminRoleId: adminRole.id,
          permissionId: perm.id,
        })),
        skipDuplicates: true,
      }),
    )
  }
  if (ops.length) await Promise.all(ops)
}

function mapMatrix(assignedCodes) {
  const assigned = new Set(assignedCodes)
  const editMatrix = EDIT_MODULES.map((item) => ({
    id: item.id,
    module: item.module,
    editEnabled:
      assigned.has(editCode(item.id)) || assigned.has(viewCode(item.id)),
  }))
  return {
    editMatrix,
    visibilityMatrix: editMatrix.map((item) => ({
      id: item.id,
      module: item.module,
      visible: item.editEnabled,
    })),
  }
}

async function assignedCodesForRole(roleName) {
  const role = await prisma.adminRole.findUnique({
    where: { name: roleName },
    include: { permissions: { include: { permission: true } } },
  })
  return (role?.permissions || []).map((row) => row.permission.code)
}

async function saveRolePermissions(roleName, body = {}) {
  const enabledIds = EDIT_MODULES.filter((item) => {
    const row = (body.edit || []).find((entry) => entry.id === item.id)
    return row ? Boolean(row.editEnabled) : false
  }).map((item) => item.id)
  const codes = codesForEnabled(enabledIds)

  const [role, perms] = await Promise.all([
    prisma.adminRole.findUnique({
      where: { name: roleName },
      select: { id: true },
    }),
    codes.length
      ? prisma.permission.findMany({
          where: { code: { in: codes } },
          select: { id: true, code: true },
        })
      : Promise.resolve([]),
  ])
  if (!role) throw httpError('Role not found', 404, 'NotFound')
  const unknown = codes.filter(
    (code) => !perms.some((perm) => perm.code === code),
  )
  if (unknown.length) {
    throw httpError('Unknown permission', 400, 'ValidationError')
  }

  const ops = [
    prisma.adminRolePermissionBridge.deleteMany({
      where: { adminRoleId: role.id },
    }),
  ]
  if (perms.length) {
    ops.push(
      prisma.adminRolePermissionBridge.createMany({
        data: perms.map((perm) => ({
          adminRoleId: role.id,
          permissionId: perm.id,
        })),
      }),
    )
  }
  await prisma.$transaction(ops)

  return mapMatrix(perms.map((perm) => perm.code))
}

function tempPassword() {
  return `Mod${crypto.randomBytes(6).toString('base64url')}!1`
}

export class AdminRolesPermissionsService {
  async get(authUser) {
    await ensureCatalog()
    const [, codes] = await Promise.all([
      assertCanManageStaff(authUser),
      assignedCodesForRole('MODERATOR'),
    ])
    const matrix = mapMatrix(codes)
    return {
      status: 200,
      body: {
        roles: STAFF_ROLES,
        ...matrix,
        message: 'Role permissions fetched',
      },
    }
  }

  async saveModeratorPermissions(authUser, body = {}) {
    await Promise.all([assertCanManageStaff(authUser), ensureCatalog()])
    const matrix = await saveRolePermissions('MODERATOR', body)
    return {
      status: 200,
      body: {
        ...matrix,
        message: 'Moderator permissions saved',
      },
    }
  }

  async invite(authUser, body = {}) {
    await Promise.all([assertCanManageStaff(authUser), ensureCatalog()])
    const email = String(body.email || '').trim().toLowerCase()
    const roleValue = String(body.role || 'moderator').trim().toLowerCase()
    if (!email) throw httpError('Email is required', 400, 'ValidationError')
    if (!STAFF_ROLES.some((item) => item.value === roleValue)) {
      throw httpError('Invalid role', 400, 'ValidationError')
    }

    if (body.edit) {
      await saveRolePermissions('MODERATOR', body)
    }

    const [existing, staffRole] = await Promise.all([
      prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true, role: true, status: true },
      }),
      prisma.adminRole.findUnique({
        where: { name: adminRoleName(roleValue) },
        select: { id: true },
      }),
    ])
    if (!staffRole) throw httpError('Role not found', 404, 'NotFound')

    let user = existing
    let temporaryPassword = null

    if (existing) {
      if (String(existing.role) !== 'ADMIN') {
        throw httpError('Email is already registered', 409, 'Conflict')
      }
      await prisma.userAdminRoleBridge.deleteMany({ where: { userId: user.id } })
    } else {
      temporaryPassword = tempPassword()
      const result = await auth.api.signUpEmail({
        body: {
          email,
          password: temporaryPassword,
          name: email.split('@')[0],
          role: 'CUSTOMER',
        },
      })
      const userId = result?.user?.id
      if (!userId) throw httpError('Could not create staff account', 500, 'InviteFailed')
      user = await prisma.user.update({
        where: { id: userId },
        data: {
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
        },
        select: { id: true, email: true, name: true, role: true, status: true },
      })
    }

    await prisma.userAdminRoleBridge.create({
      data: { userId: user.id, adminRoleId: staffRole.id },
    })

    const loginUrl = `${env.frontendUrl}/admin/login`
    void sendStaffInviteEmail({
      email: user.email,
      roleLabel: staffRoleLabel(roleValue),
      loginUrl,
      temporaryPassword,
    }).catch((err) => {
      console.error('[roles-permissions] invite email failed:', err.message)
    })

    return {
      status: 201,
      body: {
        invite: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: roleValue,
          status: 'active',
        },
        message: 'Invite sent',
      },
    }
  }
}

export default new AdminRolesPermissionsService()
