import { hashPassword, verifyPassword } from 'better-auth/crypto'
import prisma from '../../../../lib/prisma.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { formatAddressLine } from '../../../shared/address.js'
import { httpError, notFound } from '../../../shared/errors.js'
import { assertSupplier } from '../../orders/status.js'
import { saveSellerEupagoCredentials } from '../../payments/seller-eupago.js'

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
    ibanPhone: user.phoneNumber || '',
    // EuPago secrets are write-only
    eupagoApiKey: '',
    eupagoExternKey: '',
    hasEupagoCredentials: Boolean(
      user.profile?.eupagoApiKey && user.profile?.eupagoExternKey,
    ),
    rejectionReason: user.profile?.rejectionReason || null,
    verificationStatus: user.profile?.verificationStatus || 'UNVERIFIED',
  }
}

async function loadUser(userId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'SUPPLIER' },
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
          eupagoApiKey: true,
          eupagoExternKey: true,
          rejectionReason: true,
          verificationStatus: true,
        },
      },
      addresses: {
        where: { addressType: 'WAREHOUSE' },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        include: { address: true },
      },
    },
  })
  if (!user) throw notFound('Supplier not found')
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

export class SupplierProfileService {
  async get(auth, baseUrl) {
    const sellerId = assertSupplier(auth, 'Only suppliers can view profile')
    const body = await toBody(sellerId, baseUrl)
    return { status: 200, body }
  }

  async update(auth, body = {}, baseUrl) {
    const sellerId = assertSupplier(auth, 'Only suppliers can update profile')
    const name = body.name != null ? String(body.name).trim() : undefined
    const email =
      body.email != null ? String(body.email).trim().toLowerCase() : undefined
    const phone =
      body.phoneNumber != null || body.phone != null
        ? String(body.phoneNumber || body.phone).trim()
        : undefined

    if (email) {
      const clash = await prisma.user.findFirst({
        where: { email, NOT: { id: sellerId } },
        select: { id: true },
      })
      if (clash) throw httpError('Email already in use', 409, 'Conflict')
    }

    const data = {}
    if (name) data.name = name
    if (email) data.email = email
    if (phone !== undefined) data.phoneNumber = phone || null

    await prisma.user.update({ where: { id: sellerId }, data })
    const next = await toBody(sellerId, baseUrl)
    return { status: 200, body: { ...next, message: 'Profile updated' } }
  }

  async saveWarehouses(auth, body = {}, baseUrl) {
    const sellerId = assertSupplier(auth, 'Only suppliers can update warehouses')
    const incoming = (body.warehouses || [])
      .map((row) => ({
        id: row.id ? String(row.id).trim() : null,
        label: String(row.label || '').trim() || null,
        address: String(row.address || '').trim(),
      }))
      .filter((row) => row.address)

    if (!incoming.length) {
      throw httpError('Add at least one warehouse address', 400, 'ValidationError')
    }

    const existing = await prisma.userAddressBridge.findMany({
      where: { userId: sellerId, addressType: 'WAREHOUSE' },
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
            userId: sellerId,
            addressId: address.id,
            addressType: 'WAREHOUSE',
            isDefault: false,
          },
        })
        finalIds.push(address.id)
      }

      await tx.userAddressBridge.updateMany({
        where: { userId: sellerId, addressType: 'WAREHOUSE' },
        data: { isDefault: false },
      })
      if (finalIds[0]) {
        await tx.userAddressBridge.updateMany({
          where: {
            userId: sellerId,
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
            userId: sellerId,
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

    const next = await toBody(sellerId, baseUrl)
    return { status: 200, body: { ...next, message: 'Warehouses saved' } }
  }

  async changePassword(auth, body = {}) {
    assertSupplier(auth, 'Only suppliers can change password')
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
    const sellerId = assertSupplier(auth, 'Only suppliers can update IBAN')
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
        where: { userId: sellerId },
        create: { userId: sellerId, ibanNumber },
        update: { ibanNumber },
      }),
      ...(ibanPhone !== undefined
        ? [
            prisma.user.update({
              where: { id: sellerId },
              data: { phoneNumber: ibanPhone || null },
            }),
          ]
        : []),
    ])

    const next = await toBody(sellerId, baseUrl)
    return { status: 200, body: { ...next, message: 'IBAN saved' } }
  }

  async saveEupago(auth, body = {}, baseUrl) {
    const sellerId = assertSupplier(auth, 'Only suppliers can update EuPago credentials')
    await saveSellerEupagoCredentials(sellerId, body)
    const next = await toBody(sellerId, baseUrl)
    return {
      status: 200,
      body: { ...next, message: 'EuPago credentials saved' },
    }
  }

  async resubmitDocuments(auth, files) {
    const sellerId = assertSupplier(auth, 'Only suppliers can re-submit documents')
    
    const profile = await prisma.businessProfile.findUnique({
      where: { userId: sellerId },
      select: { verificationStatus: true },
    })

    if (!profile || profile.verificationStatus !== 'REJECTED') {
      throw httpError('Only rejected accounts can re-submit documents', 400, 'InvalidStatus')
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
        const fieldName = file.fieldname
        if (!documentFields.includes(fieldName)) continue
        if (!byField[fieldName]) byField[fieldName] = []
        byField[fieldName].push(`/uploads/supplier/resubmit/${file.filename}`)
      }
    }

    for (const [fieldName, urls] of Object.entries(byField)) {
      updateData[fieldName] = JSON.stringify(urls)
    }

    // Stay SUSPENDED until admin re-approves — only clear rejection + mark pending review
    await prisma.businessProfile.update({
      where: { userId: sellerId },
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

export default new SupplierProfileService()
