import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const UPLOAD_ROOT = path.resolve(__dirname, '../../../uploads')

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/jpg',
  'application/pdf',
])

/** Map Postman / client aliases → canonical field names used in profile. */
const FIELD_ALIASES = {
  companycertificate: 'companyCertificate',
  factorycertificate: 'factoryCertificate',
  rcbe: 'rcbe',
  ibanproof: 'ibanProof',
  iddocuments: 'idDocuments',
  iddocument: 'idDocuments',
  addressproof: 'addressProof',
  civilliability: 'civilLiability',
  transportercivilliability: 'transporterCivilLiability',
}

export function canonicalFieldName(name) {
  if (!name) return name
  const key = String(name).replace(/[\s_-]+/g, '').toLowerCase()
  return FIELD_ALIASES[key] || name
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const role = String(req.params.role || 'misc').toLowerCase()
    const dir = path.join(UPLOAD_ROOT, role, 'pending')
    ensureDir(dir)
    cb(null, dir)
  },
  filename(_req, file, cb) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${safe}`)
  },
})

export const upload = multer({
  storage,
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

/**
 * multer.fields() → { field: File[] }
 * multer.array()/any() → File[]
 * Normalize to a flat File[] with canonical fieldname.
 */
export function normalizeMulterFiles(files) {
  if (!files) return []

  let list = []
  if (Array.isArray(files)) {
    list = files
  } else if (typeof files === 'object') {
    list = Object.values(files).flat()
  }

  return list
    .filter(Boolean)
    .map((file) => {
      file.fieldname = canonicalFieldName(file.fieldname)
      return file
    })
}

/** Public URL path for a saved file (served from /uploads). */
export function filePublicUrl(file) {
  if (!file) return null
  const relative = path.relative(UPLOAD_ROOT, file.path).replace(/\\/g, '/')
  return `/uploads/${relative}`
}

/** Collect multer files for a field into a JSON string of URLs (or null). */
export function urlsJsonForField(filesByField, fieldName) {
  const canonical = canonicalFieldName(fieldName)
  const list =
    filesByField?.[canonical] ||
    filesByField?.[fieldName] ||
    filesByField?.[String(fieldName).toLowerCase()]
  if (!list?.length) return null
  const urls = list.map(filePublicUrl).filter(Boolean)
  if (!urls.length) return null
  return JSON.stringify(urls)
}

/** Move pending uploads into uploads/{role}/{userId}/ after signup. */
export function relocateUploads(role, userId, files = []) {
  const list = normalizeMulterFiles(files)
  if (!list.length) return []
  const destDir = path.join(UPLOAD_ROOT, role, userId)
  ensureDir(destDir)
  const moved = []

  for (const file of list) {
    const dest = path.join(destDir, path.basename(file.path))
    if (fs.existsSync(file.path)) {
      fs.renameSync(file.path, dest)
      file.path = dest
    }
    moved.push(file)
  }

  return moved
}
