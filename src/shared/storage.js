import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import multer from 'multer'
import { env } from '../config/env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Disk root for multer + generated PDFs. Served at `/uploads`. */
export const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads')

/**
 * Top-level upload folders holding personal or financial documents.
 * They live in the private bucket and are only reachable through signed links.
 */
const PRIVATE_FOLDERS = new Set([
  'supplier',
  'factory',
  'transporter',
  'company',
  'customer',
  'affiliate',
  'admin',
  'misc',
  'insurance',
  'invoices',
])

const r2 = env.storage.r2

export function isR2Enabled() {
  return Boolean(
    r2.accountId && r2.accessKeyId && r2.secretAccessKey && r2.publicUrl,
  )
}

let s3Promise = null
function s3() {
  if (!s3Promise) {
    s3Promise = import('@aws-sdk/client-s3').then((sdk) => ({
      sdk,
      client: new sdk.S3Client({
        region: 'auto',
        endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: r2.accessKeyId,
          secretAccessKey: r2.secretAccessKey,
        },
      }),
    }))
  }
  return s3Promise
}

export function normalizeUploadKey(value) {
  if (value == null) return null
  const key = String(value).replace(/\\/g, '/').replace(/^\/+/, '')
  if (!key || key.split('/').some((part) => part === '..' || part === '')) {
    return null
  }
  return key
}

/** `/uploads/a/b.pdf`, `https://host/uploads/a/b.pdf?x=1` → `a/b.pdf` */
export function uploadKeyFromUrl(stored) {
  if (!stored) return null
  const stripped = String(stored)
    .replace(/^https?:\/\/[^/]+/i, '')
    .split(/[?#]/)[0]
  const marker = '/uploads/'
  const idx = stripped.indexOf(marker)
  if (idx === -1) return null
  let relative = stripped.slice(idx + marker.length)
  try {
    relative = decodeURIComponent(relative)
  } catch {
    return null
  }
  return normalizeUploadKey(relative)
}

export function uploadKeyFromPath(fullPath) {
  if (!fullPath) return null
  const relative = path.relative(UPLOAD_ROOT, fullPath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null
  }
  return normalizeUploadKey(relative)
}

export function isPrivateUploadKey(key) {
  return PRIVATE_FOLDERS.has(String(key || '').split('/')[0])
}

function bucketFor(key) {
  return isPrivateUploadKey(key) ? r2.privateBucket : r2.publicBucket
}

function localPathFor(key) {
  const disk = path.resolve(UPLOAD_ROOT, key)
  if (!disk.startsWith(path.resolve(UPLOAD_ROOT) + path.sep)) return null
  return disk
}

function localFileExists(key) {
  const disk = localPathFor(key)
  return Boolean(disk && fs.existsSync(disk) && fs.statSync(disk).isFile())
}

function encodeKey(key) {
  return key.split('/').map(encodeURIComponent).join('/')
}

export async function putObject(key, body, contentType) {
  const { sdk, client } = await s3()
  await client.send(
    new sdk.PutObjectCommand({
      Bucket: bucketFor(key),
      Key: key,
      Body: body,
      ContentType: contentType || undefined,
    }),
  )
}

async function r2Exists(key) {
  const { sdk, client } = await s3()
  try {
    await client.send(new sdk.HeadObjectCommand({ Bucket: bucketFor(key), Key: key }))
    return true
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
      return false
    }
    throw err
  }
}

/** Move a file already written under UPLOAD_ROOT to R2 (no-op on local disk). */
export async function persistLocalFile(fullPath, contentType) {
  if (!isR2Enabled()) return
  const key = uploadKeyFromPath(fullPath)
  if (!key) return
  await putObject(key, fs.readFileSync(fullPath), contentType)
  fs.rmSync(fullPath, { force: true })
}

/** Write a generated file (e.g. invoice PDF) to R2 or local disk. */
export async function saveUploadBuffer(key, buffer, contentType) {
  const safeKey = normalizeUploadKey(key)
  if (!safeKey) throw new Error(`Invalid upload key: ${key}`)
  if (isR2Enabled()) {
    await putObject(safeKey, buffer, contentType)
    return
  }
  const disk = localPathFor(safeKey)
  fs.mkdirSync(path.dirname(disk), { recursive: true })
  fs.writeFileSync(disk, buffer)
}

export async function readStoredFile(stored) {
  const key = uploadKeyFromUrl(stored)
  if (!key) return null
  if (localFileExists(key)) return fs.readFileSync(localPathFor(key))
  if (!isR2Enabled()) return null
  const { sdk, client } = await s3()
  try {
    const res = await client.send(
      new sdk.GetObjectCommand({ Bucket: bucketFor(key), Key: key }),
    )
    return Buffer.from(await res.Body.transformToByteArray())
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NoSuchKey') {
      return null
    }
    throw err
  }
}

export async function storedFileExists(stored) {
  const key = uploadKeyFromUrl(stored)
  if (!key) return false
  if (localFileExists(key)) return true
  return isR2Enabled() ? r2Exists(key) : false
}

async function deleteKey(key) {
  if (!key) return
  try {
    const disk = localPathFor(key)
    if (disk) fs.rmSync(disk, { force: true })
    if (!isR2Enabled()) return
    const { sdk, client } = await s3()
    await client.send(
      new sdk.DeleteObjectCommand({ Bucket: bucketFor(key), Key: key }),
    )
  } catch (err) {
    console.error('[storage] delete failed', key, err?.message)
  }
}

export async function deleteStoredFile(stored) {
  await deleteKey(uploadKeyFromUrl(stored))
}

function localSignature(key, exp) {
  return crypto
    .createHmac('sha256', env.jwt.secret || 'uploads-dev-secret')
    .update(`${key}:${exp}`)
    .digest('base64url')
}

export function verifyLocalSignature(key, exp, sig) {
  const expires = Number(exp)
  if (!sig || !Number.isFinite(expires) || expires < Date.now() / 1000) {
    return false
  }
  const expected = Buffer.from(localSignature(key, expires))
  const given = Buffer.from(String(sig))
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

export async function r2SignedUrl(key) {
  const [{ sdk, client }, { getSignedUrl }] = await Promise.all([
    s3(),
    import('@aws-sdk/s3-request-presigner'),
  ])
  return getSignedUrl(
    client,
    new sdk.GetObjectCommand({ Bucket: bucketFor(key), Key: key }),
    { expiresIn: env.storage.signedUrlSeconds },
  )
}

export function r2PublicUrl(key) {
  return `${r2.publicUrl}/${encodeKey(key)}`
}

/**
 * Short-lived link for a stored file. Private files get an R2 presigned URL
 * (or an HMAC-signed `/uploads` link while still on local disk).
 */
export async function signedFileUrl(key, baseUrl) {
  const local = localFileExists(key)
  if (!isPrivateUploadKey(key)) {
    return !local && isR2Enabled()
      ? r2PublicUrl(key)
      : `${baseUrl}/uploads/${encodeKey(key)}`
  }
  if (!local && isR2Enabled()) return r2SignedUrl(key)
  const exp = Math.floor(Date.now() / 1000) + env.storage.signedUrlSeconds
  return `${baseUrl}/uploads/${encodeKey(key)}?exp=${exp}&sig=${localSignature(key, exp)}`
}

/**
 * multer.diskStorage drop-in: writes to disk, then moves the file to R2 when
 * configured. `defer: true` keeps it on disk (caller persists after relocating).
 */
export function uploadStorage({ destination, filename, defer = false }) {
  const disk = multer.diskStorage({ destination, filename })
  return {
    _handleFile(req, file, cb) {
      disk._handleFile(req, file, (err, info) => {
        if (err || defer || !isR2Enabled()) return cb(err, info)
        persistLocalFile(info.path, file.mimetype).then(
          () => cb(null, info),
          (uploadErr) => {
            fs.rmSync(info.path, { force: true })
            cb(uploadErr)
          },
        )
      })
    },
    _removeFile(_req, file, cb) {
      deleteKey(uploadKeyFromPath(file.path)).then(() => cb(null), cb)
    },
  }
}

export default { UPLOAD_ROOT }
