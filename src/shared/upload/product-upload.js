import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { UPLOAD_ROOT } from '../storage.js'

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/jpg', 'image/webp'])

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const sellerId = req.auth?.id || 'pending'
    const dir = path.join(UPLOAD_ROOT, 'products', sellerId)
    ensureDir(dir)
    cb(null, dir)
  },
  filename(_req, file, cb) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${safe}`)
  },
})

export const productUpload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 21,
  },
  fileFilter(_req, file, cb) {
    if (!IMAGE_MIME.has(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, or WEBP images are allowed'))
      return
    }
    cb(null, true)
  },
})

export const PRODUCT_FILE_FIELDS = [
  { name: 'bannerImage', maxCount: 1 },
  { name: 'images', maxCount: 20 },
]

/** CSV bulk upload — memory storage */
export const productCsvUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
  },
  fileFilter(_req, file, cb) {
    const name = String(file.originalname || '').toLowerCase()
    const mime = String(file.mimetype || '').toLowerCase()
    const ok =
      name.endsWith('.csv') ||
      mime === 'text/csv' ||
      mime === 'application/csv' ||
      mime === 'application/vnd.ms-excel' ||
      mime === 'text/plain'
    if (!ok) {
      cb(new Error('Only CSV files are allowed'))
      return
    }
    cb(null, true)
  },
})

export function productFilePublicUrl(file) {
  if (!file) return null
  const relative = path.relative(UPLOAD_ROOT, file.path).replace(/\\/g, '/')
  return `/uploads/${relative}`
}

const EXT_FROM_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * Download a remote image into uploads/products/{sellerId}/ for CSV import.
 * Returns a multer-like file object usable by productFilePublicUrl.
 */
export async function downloadRemoteProductImage(sellerId, imageUrl, label = 'img') {
  let parsed
  try {
    parsed = new URL(String(imageUrl).trim())
  } catch {
    throw new Error(`Invalid image URL: ${imageUrl}`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Image URL must be http(s): ${imageUrl}`)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  let res
  try {
    res = await fetch(parsed.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'CONSTRUPRECO-CSV-Import/1.0' },
    })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    throw new Error(`Failed to download image (${res.status}): ${imageUrl}`)
  }

  const mime = String(res.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (mime && !IMAGE_MIME.has(mime)) {
    throw new Error(`URL is not an allowed image type (${mime}): ${imageUrl}`)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > 8 * 1024 * 1024) {
    throw new Error(`Image too large (max 8MB): ${imageUrl}`)
  }
  if (!buf.length) {
    throw new Error(`Empty image download: ${imageUrl}`)
  }

  let ext =
    EXT_FROM_MIME[mime] ||
    path.extname(parsed.pathname).replace('.', '').toLowerCase() ||
    'jpg'
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) ext = 'jpg'

  const dir = path.join(UPLOAD_ROOT, 'products', sellerId || 'pending')
  ensureDir(dir)
  const safeLabel = String(label).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40)
  const filename = `${Date.now()}-${safeLabel}.${ext === 'jpeg' ? 'jpg' : ext}`
  const fullPath = path.join(dir, filename)
  fs.writeFileSync(fullPath, buf)

  return {
    path: fullPath,
    filename,
    originalname: filename,
    mimetype: mime || `image/${ext}`,
    size: buf.length,
  }
}

export default productUpload
