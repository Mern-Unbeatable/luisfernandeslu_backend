import fs from 'node:fs'
import path from 'node:path'
import prisma from '../../../../lib/prisma.js'
import { money } from '../../../shared/money.js'
import { httpError, notFound } from '../../../shared/errors.js'
import { UPLOAD_ROOT } from '../../../shared/storage.js'
import { parseStoredUrls } from '../../../lib/requestUrl.js'
import { buildInsurancePolicyPdf } from '../../../shared/pdf/insurance-policy-pdf.js'
import { documentRelativeUrlsFromFiles } from '../../../shared/upload/evidence-upload.js'
import { env } from '../../../config/env.js'

const KIND = {
  civil: 'CIVIL',
  cargo: 'CARGO',
}

function assertTransporter(auth) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'transporter') {
    throw httpError('Only transporters can manage insurance', 403, 'Forbidden')
  }
  return auth.id
}

function apiKind(kind) {
  return String(kind).toLowerCase() === 'cargo' ? 'cargo' : 'civil'
}

function dateOnly(d) {
  if (!d) return null
  const x = new Date(d)
  if (Number.isNaN(x.getTime())) return null
  return x.toISOString().slice(0, 10)
}

function parseDate(raw) {
  const value = String(raw || '').trim()
  if (!value) return null
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value)
  if (Number.isNaN(d.getTime())) {
    throw httpError('Invalid date', 400, 'ValidationError')
  }
  return d
}

function resolveStatus(expiryDate) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate)
  expiry.setHours(0, 0, 0, 0)
  return expiry < today ? 'EXPIRED' : 'VERIFIED'
}

function storeDocuments(urls) {
  if (!urls?.length) return null
  if (urls.length === 1) return urls[0]
  return JSON.stringify(urls)
}

function firstDocumentPath(stored) {
  const parsed = parseStoredUrls(stored, '')
  if (!parsed) return null
  const value = Array.isArray(parsed) ? parsed[0] : parsed
  if (!value) return null
  const relative = String(value)
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/uploads\//, '')
  return path.join(UPLOAD_ROOT, relative)
}

function mapPolicy(row, baseUrl) {
  const type = apiKind(row.kind)
  const status = String(resolveStatus(row.expiryDate)).toLowerCase()
  const docs = parseStoredUrls(row.documentUrl, baseUrl)
  const documentUrl = Array.isArray(docs) ? docs[0] : docs
  return {
    type,
    status,
    provider: row.provider,
    policyNumber: row.policyNumber,
    coverageAmount: money(row.coverageAmount),
    startDate: dateOnly(row.startDate),
    expiryDate: dateOnly(row.expiryDate),
    documentUrl: documentUrl || null,
  }
}

async function loadPolicies(userId) {
  return prisma.transporterInsurance.findMany({
    where: { userId },
    orderBy: { kind: 'asc' },
  })
}

function requirementsMet(rows) {
  const byKind = new Set(rows.map((row) => String(row.kind)))
  if (!byKind.has('CIVIL') || !byKind.has('CARGO')) return false
  return rows.every((row) => resolveStatus(row.expiryDate) === 'VERIFIED')
}

async function upsertPolicy(userId, kindApi, body, documentUrls) {
  const kind = KIND[kindApi]
  const expiryDate = parseDate(body.expiryDate)
  const startDate = body.startDate ? parseDate(body.startDate) : null
  const status = resolveStatus(expiryDate)
  const coverageAmount = money(body.coverageAmount)
  const existing = await prisma.transporterInsurance.findUnique({
    where: { userId_kind: { userId, kind } },
  })
  const documentUrl =
    storeDocuments(documentUrls) || existing?.documentUrl || null

  const row = await prisma.transporterInsurance.upsert({
    where: { userId_kind: { userId, kind } },
    create: {
      userId,
      kind,
      provider: String(body.provider).trim(),
      policyNumber: String(body.policyNumber).trim(),
      coverageAmount,
      startDate,
      expiryDate,
      documentUrl,
      status,
    },
    update: {
      provider: String(body.provider).trim(),
      policyNumber: String(body.policyNumber).trim(),
      coverageAmount,
      startDate,
      expiryDate,
      documentUrl,
      status,
    },
  })

  const profileField =
    kindApi === 'civil' ? 'insuranceDocumentUrl' : 'transporterInsuranceUrl'
  await prisma.businessProfile.upsert({
    where: { userId },
    create: { userId, [profileField]: documentUrl },
    update: { [profileField]: documentUrl },
  })

  return row
}

export class TransporterInsuranceService {
  async list(auth, baseUrl) {
    const userId = assertTransporter(auth)
    const rows = await loadPolicies(userId)
    return {
      status: 200,
      body: {
        requirementsMet: requirementsMet(rows),
        policies: rows.map((row) => mapPolicy(row, baseUrl)),
        message: 'Insurance fetched',
      },
    }
  }

  async upload(auth, body, files, baseUrl) {
    const userId = assertTransporter(auth)
    const kind = body.type || body.insuranceType
    const docs = documentRelativeUrlsFromFiles(files)
    if (!docs.length) {
      throw httpError('Insurance document is required', 400, 'ValidationError')
    }
    const row = await upsertPolicy(userId, kind, body, docs)
    return {
      status: 201,
      body: {
        ...mapPolicy(row, baseUrl),
        message: 'Insurance uploaded',
      },
    }
  }

  async renew(auth, kind, body, files, baseUrl) {
    const userId = assertTransporter(auth)
    const existing = await prisma.transporterInsurance.findUnique({
      where: { userId_kind: { userId, kind: KIND[kind] } },
    })
    if (!existing) throw notFound('Insurance policy not found')
    const docs = documentRelativeUrlsFromFiles(files)
    const row = await upsertPolicy(userId, kind, body, docs)
    return {
      status: 200,
      body: {
        ...mapPolicy(row, baseUrl),
        message: 'Insurance policy renewed',
      },
    }
  }

  async downloadPdf(auth, kind) {
    const userId = assertTransporter(auth)
    const row = await prisma.transporterInsurance.findUnique({
      where: { userId_kind: { userId, kind: KIND[kind] } },
    })
    if (!row) throw notFound('Insurance policy not found')

    const diskPath = firstDocumentPath(row.documentUrl)
    if (diskPath && fs.existsSync(diskPath) && diskPath.toLowerCase().endsWith('.pdf')) {
      const buffer = fs.readFileSync(diskPath)
      return {
        file: {
          buffer,
          filename: `${kind}-insurance.pdf`,
          contentType: 'application/pdf',
        },
      }
    }

    const buffer = await buildInsurancePolicyPdf({
      type: kind,
      provider: row.provider,
      policyNumber: row.policyNumber,
      coverageAmount: row.coverageAmount,
      startDate: dateOnly(row.startDate),
      expiryDate: dateOnly(row.expiryDate),
      status: String(row.status).toLowerCase(),
      currency: env.currency,
    })
    return {
      file: {
        buffer,
        filename: `${kind}-insurance.pdf`,
        contentType: 'application/pdf',
      },
    }
  }
}

export default new TransporterInsuranceService()
