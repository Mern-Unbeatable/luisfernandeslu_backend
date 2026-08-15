import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { fileURLToPath } from 'node:url'
import { UPLOAD_ROOT } from '../auth/upload.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

export function productFilePublicUrl(file) {
  if (!file) return null
  const relative = path.relative(UPLOAD_ROOT, file.path).replace(/\\/g, '/')
  return `/uploads/${relative}`
}

export default productUpload
