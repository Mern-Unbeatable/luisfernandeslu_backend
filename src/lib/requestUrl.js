/**
 * Resolve public API base URL from the incoming request.
 * Local → http://localhost:8080
 * Live / proxy → uses Host + X-Forwarded-* headers
 */
export function resolveRequestBaseUrl(req) {
  const forwardedProto = req.headers?.['x-forwarded-proto']
  const proto = String(forwardedProto || req.protocol || 'http')
    .split(',')[0]
    .trim()

  const forwardedHost = req.headers?.['x-forwarded-host']
  const host = String(forwardedHost || req.headers?.host || '')
    .split(',')[0]
    .trim()

  if (host) {
    return `${proto}://${host}`.replace(/\/$/, '')
  }

  return String(process.env.BETTER_AUTH_URL || 'http://localhost:8080').replace(
    /\/$/,
    '',
  )
}

export function absolutizeUrl(pathOrUrl, baseUrl) {
  if (pathOrUrl == null || pathOrUrl === '') return pathOrUrl
  const value = String(pathOrUrl)
  if (/^https?:\/\//i.test(value)) return value
  const base = String(baseUrl || '').replace(/\/$/, '')
  return `${base}${value.startsWith('/') ? '' : '/'}${value}`
}

const PROFILE_URL_KEYS = [
  'companyCertificateUrl',
  'commercialRegistrationUrl',
  'nifDocumentUrl',
  'idDocumentUrl',
  'addressProofUrl',
  'ibanProofUrl',
  'insuranceDocumentUrl',
  'transporterInsuranceUrl',
  'logoUrl',
  'coverImageUrl',
]

/** Role → profile fields that belong in the API response for that role. */
export const ROLE_PROFILE_FIELDS = {
  customer: ['id', 'userId', 'verificationStatus', 'createdAt', 'updatedAt'],
  company: [
    'id',
    'userId',
    'companyName',
    'nifNumber',
    'verificationStatus',
    'rejectionReason',
    'createdAt',
    'updatedAt',
  ],
  supplier: [
    'id',
    'userId',
    'companyName',
    'ibanNumber',
    'companyCertificateUrl',
    'commercialRegistrationUrl',
    'ibanProofUrl',
    'idDocumentUrl',
    'addressProofUrl',
    'verificationStatus',
    'rejectionReason',
    'createdAt',
    'updatedAt',
  ],
  factory: [
    'id',
    'userId',
    'companyName',
    'ibanNumber',
    'companyCertificateUrl',
    'commercialRegistrationUrl',
    'ibanProofUrl',
    'idDocumentUrl',
    'addressProofUrl',
    'verificationStatus',
    'rejectionReason',
    'createdAt',
    'updatedAt',
  ],
  transporter: [
    'id',
    'userId',
    'companyName',
    'ibanNumber',
    'ibanProofUrl',
    'insuranceDocumentUrl',
    'transporterInsuranceUrl',
    'verificationStatus',
    'rejectionReason',
    'createdAt',
    'updatedAt',
  ],
  affiliate: [
    'id',
    'userId',
    'companyName',
    'ibanNumber',
    'ibanProofUrl',
    'verificationStatus',
    'rejectionReason',
    'createdAt',
    'updatedAt',
  ],
  admin: ['id', 'userId', 'verificationStatus', 'createdAt', 'updatedAt'],
}

/** Parse DB JSON-string URL fields → absolute URL arrays (or single URL). */
export function parseStoredUrls(value, baseUrl) {
  if (value == null || value === '') return null

  let parsed = value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('[')) {
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        return absolutizeUrl(trimmed, baseUrl)
      }
    } else {
      return absolutizeUrl(trimmed, baseUrl)
    }
  }

  if (Array.isArray(parsed)) {
    const urls = parsed
      .filter(Boolean)
      .map((u) => absolutizeUrl(u, baseUrl))
    return urls.length ? urls : null
  }

  return absolutizeUrl(String(parsed), baseUrl)
}

/**
 * Profile for API response:
 * - absolute URLs
 * - only fields for that role (no transporter insurance on supplier, etc.)
 * - omit null document/url fields (only return docs that exist)
 */
export function formatProfileForResponse(profile, baseUrl, role) {
  if (!profile) return null

  const roleKey = String(role || '').toLowerCase()
  const allowed = ROLE_PROFILE_FIELDS[roleKey]

  const source = allowed
    ? Object.fromEntries(
        allowed.filter((key) => key in profile).map((key) => [key, profile[key]]),
      )
    : { ...profile }

  const out = {}
  for (const [key, raw] of Object.entries(source)) {
    let value = raw
    if (PROFILE_URL_KEYS.includes(key)) {
      value = parseStoredUrls(raw, baseUrl)
      // Skip empty document slots — only return docs that were uploaded
      if (value == null) continue
    }
    out[key] = value
  }

  return Object.keys(out).length ? out : null
}
