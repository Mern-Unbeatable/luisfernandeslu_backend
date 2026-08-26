import fs from 'node:fs'
import path from 'node:path'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import prisma from '../../../../lib/prisma.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { httpError, notFound } from '../../../shared/errors.js'
import { UPLOAD_ROOT } from '../../../shared/storage.js'
import { avatarRelativeUrlFromFiles } from '../../../shared/upload/evidence-upload.js'
import {
  encodeAddressContact,
  joinName,
  mapBuyerProfile,
} from '../buyer-profile.mapper.js'

const BUYER_ROLES = new Set(['CUSTOMER', 'COMPANY'])

function assertBuyer(auth, message) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  const role = String(auth.role || '').toUpperCase()
  if (!BUYER_ROLES.has(role)) {
    throw httpError(message, 403, 'Forbidden')
  }
  return { userId: auth.id, role }
}

function localUploadPath(stored) {
  if (!stored) return null
  const value = String(stored)
  const stripped = value.replace(/^https?:\/\/[^/]+/i, '')
  const marker = '/uploads/'
  const idx = stripped.indexOf(marker)
  if (idx === -1) return null
  const relative = stripped.slice(idx + marker.length)
  const disk = path.resolve(UPLOAD_ROOT, relative)
  if (!disk.startsWith(path.resolve(UPLOAD_ROOT))) return null
  return disk
}

function unlinkLocalUpload(stored) {
  const disk = localUploadPath(stored)
  if (!disk || !fs.existsSync(disk)) return
  try {
    fs.unlinkSync(disk)
  } catch {
    // ignore
  }
}

async function loadUser(userId, role) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      image: true,
      role: true,
      profile: {
        select: { companyName: true, ibanNumber: true, ibanPhone: true },
      },
      addresses: {
        include: { address: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      },
    },
  })
  if (!user) throw notFound('Buyer not found')
  return user
}

async function toBody(userId, role, baseUrl) {
  const user = await loadUser(userId, role)
  return {
    profile: mapBuyerProfile(user, user.addresses || [], baseUrl, absolutizeUrl),
    message: 'Profile fetched',
  }
}

async function upsertTypedAddress(tx, userId, addressType, body) {
  const streetAddress = String(
    body.streetAddress ?? body.address ?? '',
  ).trim()
  const state = String(body.state ?? body.region ?? '').trim()
  const city = String(body.city ?? '').trim()
  const zipCode = String(body.zipCode ?? '').trim()
  const country = String(body.country || 'Portugal').trim() || 'Portugal'
  const phone = body.phoneNumber ?? body.phone
  const title = encodeAddressContact({
    firstName: body.firstName,
    lastName: body.lastName,
    companyName: body.companyName,
    email: body.email,
    phone,
  })

  if (!streetAddress && !city && !state && !zipCode) {
    throw httpError(
      'Address fields are required',
      400,
      'ValidationError',
    )
  }

  const existing = await tx.userAddressBridge.findFirst({
    where: { userId, addressType, isDefault: true },
    include: { address: true },
  })
  const fallback = existing
    ? null
    : await tx.userAddressBridge.findFirst({
        where: { userId, addressType },
        include: { address: true },
        orderBy: { createdAt: 'desc' },
      })
  const bridge = existing || fallback

  if (bridge) {
    await tx.address.update({
      where: { id: bridge.addressId },
      data: {
        title,
        streetAddress: streetAddress || bridge.address.streetAddress,
        city: city || bridge.address.city,
        state: state || bridge.address.state,
        zipCode: zipCode || bridge.address.zipCode,
        country,
      },
    })
    if (!bridge.isDefault) {
      await tx.userAddressBridge.updateMany({
        where: { userId, addressType },
        data: { isDefault: false },
      })
      await tx.userAddressBridge.update({
        where: {
          userId_addressId_addressType: {
            userId,
            addressId: bridge.addressId,
            addressType,
          },
        },
        data: { isDefault: true },
      })
    }
    return bridge.addressId
  }

  await tx.userAddressBridge.updateMany({
    where: { userId, addressType },
    data: { isDefault: false },
  })

  const address = await tx.address.create({
    data: {
      title,
      streetAddress: streetAddress || '—',
      city: city || '—',
      state: state || '—',
      zipCode: zipCode || '—',
      country,
    },
  })

  await tx.userAddressBridge.create({
    data: {
      userId,
      addressId: address.id,
      addressType,
      isDefault: true,
    },
  })

  return address.id
}

class BuyerProfileService {
  async get(auth, baseUrl) {
    const { userId, role } = assertBuyer(auth, 'Only buyers can view profile')
    return { status: 200, body: await toBody(userId, role, baseUrl) }
  }

  async updateAccount(auth, body = {}, baseUrl, files) {
    const { userId, role } = assertBuyer(auth, 'Only buyers can update profile')

    const firstName =
      body.firstName != null ? String(body.firstName).trim() : undefined
    const lastName =
      body.lastName != null ? String(body.lastName).trim() : undefined
    const emailRaw =
      body.email != null ? String(body.email).trim().toLowerCase() : undefined
    const email = emailRaw === '' ? undefined : emailRaw
    const phone =
      body.phoneNumber != null || body.phone != null
        ? String(body.phoneNumber ?? body.phone).trim()
        : undefined

    const avatarFromFiles = avatarRelativeUrlFromFiles(files)
    const removeAvatar = Boolean(body.removeAvatar)

    if (email) {
      const clash = await prisma.user.findFirst({
        where: { email, NOT: { id: userId } },
        select: { id: true },
      })
      if (clash) throw httpError('Email already in use', 409, 'Conflict')
    }

    const current = await loadUser(userId, role)
    const nextName =
      firstName != null || lastName != null
        ? joinName(
            firstName ?? current.name.split(/\s+/)[0] ?? '',
            lastName ??
              current.name.split(/\s+/).slice(1).join(' ') ??
              '',
          )
        : undefined

    const userData = {}
    if (nextName) userData.name = nextName
    if (email) userData.email = email
    if (phone !== undefined) userData.phoneNumber = phone || null

    if (avatarFromFiles) {
      unlinkLocalUpload(current.image)
      userData.image = avatarFromFiles
    } else if (removeAvatar) {
      unlinkLocalUpload(current.image)
      userData.image = null
    }

    const hasLocation =
      body.region != null ||
      body.state != null ||
      body.city != null ||
      body.zipCode != null ||
      body.address != null ||
      body.streetAddress != null

    const hasAccountField =
      Object.keys(userData).length > 0 ||
      hasLocation ||
      avatarFromFiles ||
      removeAvatar

    if (!hasAccountField) {
      throw httpError(
        'Provide account fields and/or an avatar file',
        400,
        'ValidationError',
      )
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length) {
        await tx.user.update({ where: { id: userId }, data: userData })
      }
      if (hasLocation) {
        await upsertTypedAddress(tx, userId, 'PROFILE', {
          firstName: firstName ?? '',
          lastName: lastName ?? '',
          email: email ?? current.email,
          phone: phone ?? current.phoneNumber,
          region: body.region ?? body.state,
          city: body.city,
          zipCode: body.zipCode,
          address: body.address ?? body.streetAddress,
        })
      }
    })

    const next = await toBody(userId, role, baseUrl)
    return { status: 200, body: { ...next, message: 'Profile updated' } }
  }

  async changePassword(auth, body = {}) {
    assertBuyer(auth, 'Only buyers can change password')
    const currentPassword = String(body.currentPassword || '')
    const newPassword = String(body.newPassword || '')
    const confirm = body.confirmNewPassword ?? body.confirmPassword

    if (confirm != null && String(confirm) !== newPassword) {
      throw httpError(
        'Password confirmation does not match',
        400,
        'ValidationError',
      )
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
    const { userId, role } = assertBuyer(auth, 'Only buyers can update IBAN')
    const ibanNumber = String(body.ibanNumber || body.iban || '').trim()
    if (ibanNumber.length < 5) {
      throw httpError('Valid IBAN is required', 400, 'ValidationError')
    }
    const ibanPhone =
      body.ibanPhone != null || body.phoneNumber != null || body.phone != null
        ? String(body.ibanPhone || body.phoneNumber || body.phone).trim()
        : undefined

    await prisma.businessProfile.upsert({
      where: { userId },
      create: {
        userId,
        ibanNumber,
        ...(ibanPhone !== undefined ? { ibanPhone: ibanPhone || null } : {}),
      },
      update: {
        ibanNumber,
        ...(ibanPhone !== undefined ? { ibanPhone: ibanPhone || null } : {}),
      },
    })

    const next = await toBody(userId, role, baseUrl)
    return { status: 200, body: { ...next, message: 'IBAN saved' } }
  }

  async saveBillingAddress(auth, body = {}, baseUrl) {
    const { userId, role } = assertBuyer(
      auth,
      'Only buyers can update billing address',
    )
    await prisma.$transaction(async (tx) => {
      await upsertTypedAddress(tx, userId, 'BILLING', body)
      if (role === 'COMPANY' && body.companyName != null) {
        const companyName = String(body.companyName).trim()
        await tx.businessProfile.upsert({
          where: { userId },
          create: { userId, companyName: companyName || null },
          update: { companyName: companyName || null },
        })
      }
    })
    const next = await toBody(userId, role, baseUrl)
    return {
      status: 200,
      body: { ...next, message: 'Billing address saved' },
    }
  }

  async saveShippingAddress(auth, body = {}, baseUrl) {
    const { userId, role } = assertBuyer(
      auth,
      'Only buyers can update shipping address',
    )
    await prisma.$transaction(async (tx) => {
      await upsertTypedAddress(tx, userId, 'SHIPPING', body)
    })
    const next = await toBody(userId, role, baseUrl)
    return {
      status: 200,
      body: { ...next, message: 'Shipping address saved' },
    }
  }

  async uploadAvatar(auth, files, baseUrl) {
    const { userId, role } = assertBuyer(auth, 'Only buyers can update avatar')
    const image = avatarRelativeUrlFromFiles(files)
    if (!image) {
      throw httpError('Avatar image is required', 400, 'ValidationError')
    }

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { image: true },
    })
    unlinkLocalUpload(current?.image)

    await prisma.user.update({
      where: { id: userId },
      data: { image },
    })

    const next = await toBody(userId, role, baseUrl)
    return { status: 200, body: { ...next, message: 'Avatar updated' } }
  }

  async removeAvatar(auth, baseUrl) {
    const { userId, role } = assertBuyer(auth, 'Only buyers can remove avatar')
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { image: true },
    })
    unlinkLocalUpload(current?.image)
    await prisma.user.update({
      where: { id: userId },
      data: { image: null },
    })
    const next = await toBody(userId, role, baseUrl)
    return { status: 200, body: { ...next, message: 'Avatar removed' } }
  }
}

export default new BuyerProfileService()
