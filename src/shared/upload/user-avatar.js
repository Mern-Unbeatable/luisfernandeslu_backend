import prisma from '../../../lib/prisma.js'
import { httpError } from '../errors.js'
import { deleteStoredFile } from '../storage.js'
import { avatarRelativeUrlFromFiles } from './evidence-upload.js'

export function unlinkLocalUpload(stored) {
  void deleteStoredFile(stored)
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
