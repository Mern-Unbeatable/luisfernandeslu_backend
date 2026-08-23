import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { UPLOAD_ROOT } from '../storage.js'
import { absolutizeUrl } from '../../lib/requestUrl.js'

const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
])
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp'])

const RETURN_MIME = new Set([
  ...IMAGE_MIME,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const RETURN_EXT = new Set([...IMAGE_EXT, '.pdf', '.doc', '.docx'])

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function extOf(file) {
  return path.extname(file.originalname || '').toLowerCase()
}

function makeUpload({ folder, mime, ext, errorMessage }) {
  return multer({
    storage: multer.diskStorage({
      destination(req, _file, cb) {
        const userId = req.auth?.id || 'pending'
        const dir = path.join(UPLOAD_ROOT, folder, userId)
        ensureDir(dir)
        cb(null, dir)
      },
      filename(_req, file, cb) {
        const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
        cb(null, `${Date.now()}-${safe}`)
      },
    }),
    limits: {
      fileSize: 8 * 1024 * 1024,
      files: 10,
    },
    fileFilter(_req, file, cb) {
      const mimeOk = mime.has(String(file.mimetype || '').toLowerCase())
      const extOk = ext.has(extOf(file))
      if (!mimeOk && !extOk) {
        cb(new Error(errorMessage))
        return
      }
      cb(null, true)
    },
  })
}

export const EVIDENCE_FILE_FIELDS = [
  { name: 'evidence', maxCount: 10 },
  { name: 'evidence[]', maxCount: 10 },
]

export const disputeEvidenceUpload = makeUpload({
  folder: 'disputes',
  mime: IMAGE_MIME,
  ext: IMAGE_EXT,
  errorMessage: 'Only JPEG, PNG, or WEBP images are allowed',
})

export const returnEvidenceUpload = makeUpload({
  folder: 'returns',
  mime: RETURN_MIME,
  ext: RETURN_EXT,
  errorMessage: 'Only JPEG, PNG, WEBP, PDF, DOC, or DOCX files are allowed',
})

export function evidenceFilePublicUrl(file) {
  if (!file) return null
  const relative = path.relative(UPLOAD_ROOT, file.path).replace(/\\/g, '/')
  return `/uploads/${relative}`
}

function collectedFiles(files) {
  if (!files) return []
  if (Array.isArray(files)) return files
  return [
    ...(files.evidence || []),
    ...(files['evidence[]'] || []),
  ]
}

export function evidenceUrlsFromFiles(files, baseUrl) {
  return collectedFiles(files)
    .map((file) => {
      const url = evidenceFilePublicUrl(file)
      return url ? absolutizeUrl(url, baseUrl) : null
    })
    .filter(Boolean)
}

export function optionalUrlList(value) {
  if (value == null || value === '') return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return parsed
      } catch {
        return [trimmed]
      }
    }
    return [trimmed]
  }
  return []
}

export function mergeEvidence(body, files, baseUrl) {
  const uploaded = evidenceUrlsFromFiles(files, baseUrl)
  return {
    ...body,
    evidence: [...(body?.evidence || []), ...uploaded],
  }
}

export default {
  disputeEvidenceUpload,
  returnEvidenceUpload,
  EVIDENCE_FILE_FIELDS,
}
