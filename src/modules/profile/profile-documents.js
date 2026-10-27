import { parseStoredUrls } from '../../lib/requestUrl.js'

/** Verification documents each seller role keeps on its profile. */
export const ROLE_DOCUMENT_FIELDS = {
  supplier: [
    'companyCertificateUrl',
    'commercialRegistrationUrl',
    'idDocumentUrl',
    'addressProofUrl',
    'ibanProofUrl',
  ],
  factory: [
    'companyCertificateUrl',
    'commercialRegistrationUrl',
    'idDocumentUrl',
    'addressProofUrl',
    'ibanProofUrl',
  ],
  transporter: ['insuranceDocumentUrl', 'transporterInsuranceUrl', 'ibanProofUrl'],
}

/** Approved accounts may replace documents too; that sends them back to review. */
export const DOCUMENT_SUBMIT_STATUSES = ['UNVERIFIED', 'PENDING_REVIEW', 'REJECTED', 'APPROVED']

export function documentSelect(role) {
  return Object.fromEntries(ROLE_DOCUMENT_FIELDS[role].map((key) => [key, true]))
}

/** Every expected document, with the uploaded file URLs (empty when missing). */
export function mapProfileDocuments(profile, role, baseUrl) {
  return ROLE_DOCUMENT_FIELDS[role].map((key) => {
    const parsed = parseStoredUrls(profile?.[key], baseUrl)
    const urls = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
    return { key, urls }
  })
}
