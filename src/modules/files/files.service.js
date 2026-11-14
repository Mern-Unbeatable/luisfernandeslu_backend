import prisma from '../../../lib/prisma.js'
import { httpError } from '../../shared/errors.js'
import { env } from '../../config/env.js'
import {
  isPrivateUploadKey,
  signedFileUrl,
  uploadKeyFromUrl,
} from '../../shared/storage.js'

const PROFILE_DOCUMENT_FIELDS = [
  'companyCertificateUrl',
  'commercialRegistrationUrl',
  'nifDocumentUrl',
  'idDocumentUrl',
  'addressProofUrl',
  'ibanProofUrl',
  'insuranceDocumentUrl',
  'transporterInsuranceUrl',
]

/**
 * Private keys look like `{role}/{userId}/…`, `insurance/{userId}/…` or
 * `invoices/{sellerId}/…`. Older resubmits sit in `{role}/resubmit/…` and are
 * matched against the caller's own profile instead.
 */
async function canAccess(auth, key) {
  if (auth.role === 'admin') return true
  const [folder, owner] = key.split('/')
  if (owner === auth.id) return true

  if (folder === 'invoices') {
    const invoice = await prisma.invoice.findFirst({
      where: {
        pdfUrl: { endsWith: key },
        order: { OR: [{ customerId: auth.id }, { sellerId: auth.id }] },
      },
      select: { id: true },
    })
    return Boolean(invoice)
  }

  if (owner === 'resubmit' || owner === 'pending') {
    const profile = await prisma.businessProfile.findFirst({
      where: {
        userId: auth.id,
        OR: PROFILE_DOCUMENT_FIELDS.map((field) => ({ [field]: { contains: key } })),
      },
      select: { id: true },
    })
    return Boolean(profile)
  }

  return false
}

class FilesService {
  async signedUrl(auth, url, baseUrl) {
    const key = uploadKeyFromUrl(url)
    if (!key) throw httpError('Not a stored file', 400, 'ValidationError')
    if (isPrivateUploadKey(key) && !(await canAccess(auth, key))) {
      throw httpError('You do not have access to this file', 403, 'Forbidden')
    }
    return {
      status: 200,
      body: {
        url: await signedFileUrl(key, baseUrl),
        expiresIn: env.storage.signedUrlSeconds,
      },
    }
  }
}

export default new FilesService()
