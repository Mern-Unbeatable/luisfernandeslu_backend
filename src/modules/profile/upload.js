import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { UPLOAD_ROOT } from '../../shared/storage.js'

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/jpg',
  'image/webp',
  'application/pdf',
])

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

const resubmitStorage = multer.diskStorage({
  destination(req, _file, cb) {
    const role = String(req.auth?.role || 'misc').toLowerCase()
    const dir = path.join(UPLOAD_ROOT, role, 'resubmit')
    ensureDir(dir)
    cb(null, dir)
  },
  filename(_req, file, cb) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${safe}`)
  },
})

export const resubmitUpload = multer({
  storage: resubmitStorage,
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 40,
  },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, or PDF files are allowed'))
      return
    }
    cb(null, true)
  },
})

export function filePublicUrl(file) {
  if (!file) return null
  const relative = path.relative(UPLOAD_ROOT, file.path).replace(/\\/g, '/')
  return `/uploads/${relative}`
}
