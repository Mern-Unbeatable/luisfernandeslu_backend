import { hashPassword, verifyPassword } from 'better-auth/crypto'
import prisma from '../../../../lib/prisma.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { formatAddressLine } from '../../../shared/address.js'
import { httpError, notFound } from '../../../shared/errors.js'
import { saveSellerEupagoCredentials } from '../../payments/seller-eupago.js'
import {
  clearUserAvatar,
  replaceUserAvatar,
} from '../../../shared/upload/user-avatar.js'
import {
  DOCUMENT_SUBMIT_STATUSES,
  documentSelect,
  mapProfileDocuments,
} from '../profile-documents.js'

function assertFactory(auth, message) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'factory') {
    throw httpError(message, 403, 'Forbidden')
  }
  return auth.id
}

function warehouseLine(address) {
  if (!address) return ''
  const line = formatAddressLine(address)
  if (line && line !== address.streetAddress) return line
  return address.streetAddress || line || ''
}

function mapWarehouse(bridge, index) {
  const address = bridge.address
  return {
    id: address.id,
    label: address.title || `Warehouse ${index + 1}`,
    address: warehouseLine(address),
  }
}

function mapProfile(user, warehouses, baseUrl) {
  const companyName = user.profile?.companyName || user.name
  return {
    displayName: companyName,
    displayEmail: user.email,
    name: user.name,
    email: user.email,
    phone: user.phoneNumber || '',
    avatarUrl: user.image ? absolutizeUrl(user.image, baseUrl) : null,
    warehouses,
    iban: user.profile?.ibanNumber || '',
    ibanPhone: user.profile?.ibanPhone || '',
    eupagoApiKey: '',
    eupagoExternKey: '',
    hasEupagoCredentials: Boolean(user.profile?.eupagoExternKey?.trim()),
    rejectionReason: user.profile?.rejectionReason || null,
    verificationStatus: user.profile?.verificationStatus || 'UNVERIFIED',
    documents: mapProfileDocuments(user.profile, 'factory', baseUrl),
  }
}

async function loadUser(userId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'FACTORY' },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      image: true,
      profile: {
        select: {
          companyName: true,
          ibanNumber: true,
          ibanPhone: true,
          eupagoApiKey: true,
          eupagoExternKey: true,
          rejectionReason: true,
          verificationStatus: true,
          ...documentSelect('factory'),
        },
      },
      addresses: {
        where: { addressType: 'WAREHOUSE' },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        include: { address: true },
      },
    },
  })
  if (!user) throw notFound('Factory not found')
  return user
}

async function toBody(userId, baseUrl) {
  const user = await loadUser(userId)
  const warehouses = user.addresses.map((bridge, index) =>
    mapWarehouse(bridge, index),
  )
  return {
    profile: mapProfile(user, warehouses, baseUrl),
    message: 'Profile fetched',
  }
}

export class FactoryProfileService {
  async get(auth, baseUrl) {
    const factoryId = assertFactory(auth, 'Only factories can view profile')
    const body = await toBody(factoryId, baseUrl)
    return { status: 200, body }
  }

  async update(auth, body = {}, baseUrl) {
    const factoryId = assertFactory(auth, 'Only factories can update profile')
    const name = body.name != null ? String(body.name).trim() : undefined
    const email =
      body.email != null ? String(body.email).trim().toLowerCase() : undefined
    const phone =
      body.phoneNumber != null || body.phone != null
        ? String(body.phoneNumber || body.phone).trim()
        : undefined

    if (email) {
      const clash = await prisma.user.findFirst({
        where: { email, NOT: { id: factoryId } },
        select: { id: true },
      })
      if (clash) throw httpError('Email already in use', 409, 'Conflict')
    }

    const data = {}
    if (name) data.name = name
    if (email) data.email = email
    if (phone !== undefined) data.phoneNumber = phone || null
    if (!Object.keys(data).length) {
      throw httpError('Provide at least one field to update', 400, 'ValidationError')
    }

    await prisma.user.update({ where: { id: factoryId }, data })
    const next = await toBody(factoryId, baseUrl)
    return { status: 200, body: { ...next, message: 'Profile updated' } }
  }

  async saveWarehouses(auth, body = {}, baseUrl) {
    const factoryId = assertFactory(auth, 'Only factories can update warehouses')
    const incoming = (body.warehouses || [])
      .map((row) => ({
        id: row.id ? String(row.id).trim() : null,
        label: String(row.label || '').trim() || null,
        address: String(row.address || '').trim(),
      }))
      .filter((row) => row.address)

    // If no warehouses provided, all existing warehouse links will be removed

    const existing = await prisma.userAddressBridge.findMany({
      where: { userId: factoryId, addressType: 'WAREHOUSE' },
      select: { addressId: true },
    })
    const keep = new Set(incoming.map((row) => row.id).filter(Boolean))

    await prisma.$transaction(async (tx) => {
      const finalIds = []
      for (let i = 0; i < incoming.length; i += 1) {
        const row = incoming[i]
        const title = row.label || `Warehouse ${i + 1}`
        const owned = row.id
          ? existing.some((item) => item.addressId === row.id)
          : false

        if (owned) {
          await tx.address.update({
            where: { id: row.id },
            data: {
              title,
              streetAddress: row.address,
              city: '',
              state: '',
              zipCode: '',
              country: '',
            },
          })
          finalIds.push(row.id)
          continue
        }

        const address = await tx.address.create({
          data: {
            title,
            streetAddress: row.address,
            city: '',
            state: '',
            zipCode: '',
            country: '',
          },
        })
        await tx.userAddressBridge.create({
          data: {
            userId: factoryId,
            addressId: address.id,
            addressType: 'WAREHOUSE',
            isDefault: false,
          },
        })
        finalIds.push(address.id)
      }

      await tx.userAddressBridge.updateMany({
        where: { userId: factoryId, addressType: 'WAREHOUSE' },
        data: { isDefault: false },
      })
      if (finalIds[0]) {
        await tx.userAddressBridge.updateMany({
          where: {
            userId: factoryId,
            addressId: finalIds[0],
            addressType: 'WAREHOUSE',
          },
          data: { isDefault: true },
        })
      }

      const removeIds = existing
        .map((item) => item.addressId)
        .filter((id) => !keep.has(id))

      for (const addressId of removeIds) {
        await tx.userAddressBridge.deleteMany({
          where: {
            userId: factoryId,
            addressId,
            addressType: 'WAREHOUSE',
          },
        })
        const stillLinked = await tx.userAddressBridge.count({
          where: { addressId },
        })
        const usedOnOrders = await tx.order.count({
          where: {
            OR: [
              { shippingAddressId: addressId },
              { billingAddressId: addressId },
            ],
          },
        })
        if (!stillLinked && !usedOnOrders) {
          await tx.address.delete({ where: { id: addressId } })
        }
      }
    })

    const next = await toBody(factoryId, baseUrl)
    return { status: 200, body: { ...next, message: 'Warehouses saved' } }
  }

  async changePassword(auth, body = {}) {
    assertFactory(auth, 'Only factories can change password')
    const newPassword = String(body.password || body.newPassword || '')
    const confirm = body.confirmNewPassword ?? body.confirmPassword
    const currentPassword = body.currentPassword

    if (newPassword.length < 8) {
      throw httpError('Password must be at least 8 characters', 400, 'ValidationError')
    }
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

    if (currentPassword != null && String(currentPassword).length > 0) {
      const ok = await verifyPassword({
        hash: account.password,
        password: String(currentPassword),
      })
      if (!ok) {
        throw httpError('Current password is incorrect', 400, 'InvalidPassword')
      }
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
    const factoryId = assertFactory(auth, 'Only factories can update IBAN')
    const ibanNumber = String(body.ibanNumber || body.iban || '').trim()
    if (ibanNumber.length < 5) {
      throw httpError('Valid IBAN is required', 400, 'ValidationError')
    }
    const ibanPhone =
      body.ibanPhone != null || body.phoneNumber != null || body.phone != null
        ? String(body.ibanPhone || body.phoneNumber || body.phone).trim()
        : undefined

    await prisma.businessProfile.upsert({
      where: { userId: factoryId },
      create: {
        userId: factoryId,
        ibanNumber,
        ...(ibanPhone !== undefined ? { ibanPhone: ibanPhone || null } : {}),
      },
      update: {
        ibanNumber,
        ...(ibanPhone !== undefined ? { ibanPhone: ibanPhone || null } : {}),
      },
    })

    const next = await toBody(factoryId, baseUrl)
    return { status: 200, body: { ...next, message: 'IBAN saved' } }
  }

  async saveEupago(auth, body = {}, baseUrl) {
    const factoryId = assertFactory(auth, 'Only factories can update EuPago credentials')
    await saveSellerEupagoCredentials(factoryId, body)
    const next = await toBody(factoryId, baseUrl)
    return {
      status: 200,
      body: { ...next, message: 'EuPago credentials saved' },
    }
  }

  async uploadAvatar(auth, files, baseUrl) {
    const factoryId = assertFactory(auth, 'Only factories can update avatar')
    await replaceUserAvatar(factoryId, files)
    const next = await toBody(factoryId, baseUrl)
    return { status: 200, body: { ...next, message: 'Avatar updated' } }
  }

  async removeAvatar(auth, baseUrl) {
    const factoryId = assertFactory(auth, 'Only factories can update avatar')
    await clearUserAvatar(factoryId)
    const next = await toBody(factoryId, baseUrl)
    return { status: 200, body: { ...next, message: 'Avatar removed' } }
  }

  async resubmitDocuments(auth, files) {
    const factoryId = assertFactory(auth, 'Only factories can re-submit documents')
    
    const profile = await prisma.businessProfile.findUnique({
      where: { userId: factoryId },
      select: { verificationStatus: true },
    })

    if (!profile || !DOCUMENT_SUBMIT_STATUSES.includes(profile.verificationStatus)) {
      throw httpError('Documents cannot be submitted for this account', 400, 'InvalidStatus')
    }

    // Prisma column is companyCertificateUrl; accept factoryCertificateUrl as alias
    const fieldAliases = {
      factoryCertificateUrl: 'companyCertificateUrl',
    }
    const documentFields = [
      'companyCertificateUrl',
      'commercialRegistrationUrl',
      'nifDocumentUrl',
      'idDocumentUrl',
      'addressProofUrl',
      'ibanProofUrl',
    ]

    const updateData = { verificationStatus: 'PENDING_REVIEW', rejectionReason: null }
    const byField = {}

    if (files && Array.isArray(files)) {
      for (const file of files) {
        const fieldName = fieldAliases[file.fieldname] || file.fieldname
        if (!documentFields.includes(fieldName)) continue
        if (!byField[fieldName]) byField[fieldName] = []
        byField[fieldName].push(`/uploads/factory/resubmit/${file.filename}`)
      }
    }

    if (Object.keys(byField).length === 0) {
      throw httpError('Upload at least one document', 400, 'DocumentsRequired')
    }

    for (const [fieldName, urls] of Object.entries(byField)) {
      updateData[fieldName] = JSON.stringify(urls)
    }

    await prisma.businessProfile.update({
      where: { userId: factoryId },
      data: updateData,
    })

    return {
      status: 200,
      body: {
        message: 'Documents re-submitted for review',
        verificationStatus: 'PENDING_REVIEW',
        rejectionReason: null,
      },
    }
  }
}

export default new FactoryProfileService()
