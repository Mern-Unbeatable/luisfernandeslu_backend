import fs from 'node:fs'
import path from 'node:path'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import prisma from '../../../../lib/prisma.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { httpError, notFound } from '../../../shared/errors.js'
import { UPLOAD_ROOT } from '../../../shared/storage.js'
import { avatarRelativeUrlFromFiles } from '../../../shared/upload/evidence-upload.js'
import {
  DOCUMENT_SUBMIT_STATUSES,
  documentSelect,
  mapProfileDocuments,
} from '../profile-documents.js'

function assertTransporter(auth, message) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'transporter') {
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
    phone: user.phoneNumber || '',
    avatarUrl: user.image ? absolutizeUrl(user.image, baseUrl) : null,
    iban: user.profile?.ibanNumber || '',
    rejectionReason: user.profile?.rejectionReason || null,
    verificationStatus: user.profile?.verificationStatus || 'UNVERIFIED',
    documents: mapProfileDocuments(user.profile, 'transporter', baseUrl),
  }
}

async function loadUser(userId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'TRANSPORTER' },
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
          rejectionReason: true,
          verificationStatus: true,
          ...documentSelect('transporter'),
        },
      },
    },
  })
  if (!user) throw notFound('Transporter not found')
  return user
}

async function toBody(userId, baseUrl) {
  const user = await loadUser(userId)
  return {
    profile: mapProfile(user, baseUrl),
    message: 'Profile fetched',
  }
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
    // ignore missing files
  }
}

export class TransporterProfileService {
  async get(auth, baseUrl) {
    const userId = assertTransporter(auth, 'Only transporters can view profile')
    const body = await toBody(userId, baseUrl)
    return { status: 200, body }
  }

  async update(auth, body = {}, baseUrl) {
    const userId = assertTransporter(auth, 'Only transporters can update profile')
    const name =
      body.name != null || body.fullName != null
        ? String(body.name || body.fullName).trim()
        : undefined
    const phone =
      body.phoneNumber != null || body.phone != null
        ? String(body.phoneNumber || body.phone).trim()
        : undefined

    const data = {}
    if (name) data.name = name
    if (phone !== undefined) data.phoneNumber = phone || null
    if (!Object.keys(data).length) {
      throw httpError('Provide at least one field to update', 400, 'ValidationError')
    }

    await prisma.user.update({ where: { id: userId }, data })
    const next = await toBody(userId, baseUrl)
    return { status: 200, body: { ...next, message: 'Profile updated' } }
  }

  async changePassword(auth, body = {}) {
    assertTransporter(auth, 'Only transporters can change password')
    const newPassword = String(body.password || body.newPassword || '')
    const confirm = body.confirmPassword
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
    const userId = assertTransporter(auth, 'Only transporters can update IBAN')
    const ibanNumber = String(body.ibanNumber || body.iban || '').trim()
    if (ibanNumber.length < 5) {
      throw httpError('Valid IBAN is required', 400, 'ValidationError')
    }
    await prisma.businessProfile.upsert({
      where: { userId },
      create: { userId, ibanNumber },
      update: { ibanNumber },
    })

    const next = await toBody(userId, baseUrl)
    return { status: 200, body: { ...next, message: 'IBAN saved' } }
  }

  async uploadAvatar(auth, files, baseUrl) {
    const userId = assertTransporter(auth, 'Only transporters can update avatar')
    const image = avatarRelativeUrlFromFiles(files)
    if (!image) {
      throw httpError('Avatar image is required', 400, 'ValidationError')
    }

    const current = await prisma.user.findFirst({
      where: { id: userId },
      select: { image: true },
    })
    unlinkLocalUpload(current?.image)

    await prisma.user.update({
      where: { id: userId },
      data: { image },
    })

    const next = await toBody(userId, baseUrl)
    return { status: 200, body: { ...next, message: 'Avatar updated' } }
  }

  async removeAvatar(auth, baseUrl) {
    const userId = assertTransporter(auth, 'Only transporters can update avatar')
    const current = await prisma.user.findFirst({
      where: { id: userId },
      select: { image: true },
    })
    unlinkLocalUpload(current?.image)

    await prisma.user.update({
      where: { id: userId },
      data: { image: null },
    })

    const next = await toBody(userId, baseUrl)
    return { status: 200, body: { ...next, message: 'Avatar removed' } }
  }

  async resubmitDocuments(auth, files) {
    const userId = assertTransporter(auth, 'Only transporters can re-submit documents')
    
    const profile = await prisma.businessProfile.findUnique({
      where: { userId },
      select: { verificationStatus: true },
    })

    if (!profile || !DOCUMENT_SUBMIT_STATUSES.includes(profile.verificationStatus)) {
      throw httpError('Documents cannot be submitted for this account', 400, 'InvalidStatus')
    }

    const documentFields = [
      'ibanProofUrl',
      'insuranceDocumentUrl',
      'transporterInsuranceUrl',
      'idDocumentUrl',
      'addressProofUrl',
    ]

    const updateData = { verificationStatus: 'PENDING_REVIEW', rejectionReason: null }
    const byField = {}

    if (files && Array.isArray(files)) {
      for (const file of files) {
        const fieldName = file.fieldname
        if (!documentFields.includes(fieldName)) continue
        if (!byField[fieldName]) byField[fieldName] = []
        byField[fieldName].push(`/uploads/transporter/resubmit/${file.filename}`)
      }
    }

    if (Object.keys(byField).length === 0) {
      throw httpError('Upload at least one document', 400, 'DocumentsRequired')
    }

    for (const [fieldName, urls] of Object.entries(byField)) {
      updateData[fieldName] = JSON.stringify(urls)
    }

    await prisma.businessProfile.update({
      where: { userId },
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

export default new TransporterProfileService()
