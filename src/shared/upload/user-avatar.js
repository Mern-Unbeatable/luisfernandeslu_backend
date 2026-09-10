import fs from 'node:fs'
import path from 'node:path'
import prisma from '../../../lib/prisma.js'
import { httpError } from '../errors.js'
import { UPLOAD_ROOT } from '../storage.js'
import { avatarRelativeUrlFromFiles } from './evidence-upload.js'

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

export function unlinkLocalUpload(stored) {
  const disk = localUploadPath(stored)
  if (!disk || !fs.existsSync(disk)) return
  try {
    fs.unlinkSync(disk)
  } catch {
    // ignore missing files
  }
}

/** Replace `user.image` from multipart avatar/image fields. Returns relative URL. */
export async function replaceUserAvatar(userId, files) {
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

  return image
}

/** Clear `user.image` and delete local file if present. */
export async function clearUserAvatar(userId) {
  const current = await prisma.user.findFirst({
    where: { id: userId },
    select: { image: true },
  })
  unlinkLocalUpload(current?.image)

  await prisma.user.update({
    where: { id: userId },
    data: { image: null },
  })
}
