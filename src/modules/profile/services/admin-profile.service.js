import { hashPassword, verifyPassword } from 'better-auth/crypto'
import prisma from '../../../../lib/prisma.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { httpError, notFound } from '../../../shared/errors.js'
import { getAdminStaffAccess } from '../../auth/staffAccess.js'

function assertAdmin(auth, message) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'admin') {
    throw httpError(message, 403, 'Forbidden')
  }
  return auth.id
}

function mapProfile(user, baseUrl) {
  const companyName = user.profile?.companyName || user.name
  return {
    displayName: companyName,
    displayEmail: user.email,
    name: user.name,
    email: user.email,
    avatarUrl: user.image ? absolutizeUrl(user.image, baseUrl) : null,
    // EuPago secrets are write-only — never returned by GET
    iban: '',
    ibanPhone: '',
  }
}

async function loadUser(userId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'ADMIN' },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      image: true,
      profile: {
        select: {
          companyName: true,
        },
      },
    },
  })
  if (!user) throw notFound('Admin not found')
  return user
}

async function toBody(userId, baseUrl) {
  const user = await loadUser(userId)
  return {
    profile: mapProfile(user, baseUrl),
    message: 'Profile fetched',
  }
}

export class AdminProfileService {
  async get(auth, baseUrl) {
    const adminId = assertAdmin(auth, 'Only admins can view this profile')
    const body = await toBody(adminId, baseUrl)
    return { status: 200, body }
  }

  async update(auth, body = {}, baseUrl) {
    const adminId = assertAdmin(auth, 'Only admins can update this profile')
    const name = body.name != null ? String(body.name).trim() : undefined
    const email =
      body.email != null ? String(body.email).trim().toLowerCase() : undefined

    if (email) {
      const clash = await prisma.user.findFirst({
        where: { email, NOT: { id: adminId } },
        select: { id: true },
      })
      if (clash) throw httpError('Email already in use', 409, 'Conflict')
    }

    const data = {}
    if (name) data.name = name
    if (email) data.email = email

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.user.update({ where: { id: adminId }, data })
      }
      if (name) {
        await tx.businessProfile.upsert({
          where: { userId: adminId },
          create: { userId: adminId, companyName: name },
          update: { companyName: name },
        })
      }
    })

    const next = await toBody(adminId, baseUrl)
    return { status: 200, body: { ...next, message: 'Profile updated' } }
  }

  async changePassword(auth, body = {}) {
    assertAdmin(auth, 'Only admins can change this password')
    const currentPassword = String(body.currentPassword || '')
    const newPassword = String(body.newPassword || '')
    const confirm = body.confirmNewPassword ?? body.confirmPassword

    if (confirm != null && String(confirm) !== newPassword) {
      throw httpError('Password confirmation does not match', 400, 'ValidationError')
    }

    const account = await prisma.account.findFirst({
      where: { userId: auth.id, providerId: 'credential' },
      select: { id: true, password: true },
    })
    if (!account?.password) {
      throw httpError('No password account found', 400, 'NoCredentialAccount')
    }

    const ok = await verifyPassword({
      hash: account.password,
      password: currentPassword,
    })
    if (!ok) {
      throw httpError('Current password is incorrect', 400, 'InvalidPassword')
    }

    const hashed = await hashPassword(newPassword)
    await prisma.account.update({
      where: { id: account.id },
      data: { password: hashed },
    })
    await prisma.session.deleteMany({ where: { userId: auth.id } })

    return { status: 200, body: { message: 'Password changed successfully' } }
  }

  async saveIban(auth, body = {}, baseUrl) {
    const adminId = assertAdmin(auth, 'Only admins can update EuPago credentials')
    const staffAccess = await getAdminStaffAccess(adminId)
    if (!staffAccess.isFullAdmin) {
      throw httpError(
        'Moderators cannot update EuPago credentials',
        403,
        'Forbidden',
      )
    }

    const apiKey = String(
      body.eupagoApiKey ?? body.apiKey ?? body.ibanNumber ?? body.iban ?? '',
    ).trim()
    const externKey = String(
      body.eupagoExternKey ?? body.externKey ?? body.ibanPhone ?? '',
    ).trim()

    if (!apiKey && !externKey) {
      throw httpError(
        'Provide API key or EuPago extern key',
        400,
        'ValidationError',
      )
    }

    await prisma.businessProfile.upsert({
      where: { userId: adminId },
      create: {
        userId: adminId,
        ...(apiKey ? { ibanNumber: apiKey } : {}),
        ...(externKey ? { eupagoExternKey: externKey } : {}),
      },
      update: {
        ...(apiKey ? { ibanNumber: apiKey } : {}),
        ...(externKey ? { eupagoExternKey: externKey } : {}),
      },
    })

    const next = await toBody(adminId, baseUrl)
    return {
      status: 200,
      body: { ...next, message: 'EuPago credentials saved' },
    }
  }
}

export default new AdminProfileService()
