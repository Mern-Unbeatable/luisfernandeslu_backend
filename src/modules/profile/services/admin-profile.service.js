import { hashPassword, verifyPassword } from 'better-auth/crypto'
import prisma from '../../../../lib/prisma.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { httpError, notFound } from '../../../shared/errors.js'

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
    iban: user.profile?.ibanNumber || '',
    ibanPhone: user.profile?.ibanPhone || user.phoneNumber || '',
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
      profile: { select: { companyName: true, ibanNumber: true, ibanPhone: true } },
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
    const adminId = assertAdmin(auth, 'Only admins can update IBAN')
    const ibanNumber = String(body.ibanNumber || body.iban || '').trim()
    if (ibanNumber.length < 5) {
      throw httpError('Valid IBAN is required', 400, 'ValidationError')
    }
    const ibanPhone =
      body.ibanPhone != null || body.phoneNumber != null || body.phone != null
        ? String(body.ibanPhone || body.phoneNumber || body.phone).trim()
        : undefined

    await prisma.$transaction([
      prisma.businessProfile.upsert({
        where: { userId: adminId },
        create: {
          userId: adminId,
          ibanNumber,
          ...(ibanPhone !== undefined ? { ibanPhone: ibanPhone || null } : {}),
        },
        update: {
          ibanNumber,
          ...(ibanPhone !== undefined ? { ibanPhone: ibanPhone || null } : {}),
        },
      }),
      ...(ibanPhone !== undefined
        ? [
            prisma.user.update({
              where: { id: adminId },
              data: { phoneNumber: ibanPhone || null },
            }),
          ]
        : []),
    ])

    const next = await toBody(adminId, baseUrl)
    return { status: 200, body: { ...next, message: 'IBAN saved' } }
  }
}

export default new AdminProfileService()
