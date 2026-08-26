const CONTACT_PREFIX = 'cp1:'

export function splitName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

export function joinName(firstName, lastName) {
  return [firstName, lastName]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ')
}

export function encodeAddressContact(contact = {}) {
  const payload = {
    firstName: String(contact.firstName || '').trim(),
    lastName: String(contact.lastName || '').trim(),
    companyName: String(contact.companyName || '').trim(),
    email: String(contact.email || '').trim(),
    phone: String(contact.phone || contact.phoneNumber || '').trim(),
  }
  return `${CONTACT_PREFIX}${JSON.stringify(payload)}`
}

export function decodeAddressContact(title) {
  const raw = String(title || '')
  if (raw.startsWith(CONTACT_PREFIX)) {
    try {
      const parsed = JSON.parse(raw.slice(CONTACT_PREFIX.length))
      return {
        firstName: parsed.firstName || '',
        lastName: parsed.lastName || '',
        companyName: parsed.companyName || '',
        email: parsed.email || '',
        phone: parsed.phone || '',
      }
    } catch {
      // fall through
    }
  }
  const { firstName, lastName } = splitName(raw)
  return {
    firstName,
    lastName,
    companyName: '',
    email: '',
    phone: '',
  }
}

export function mapBuyerAddressCard(bridge, fallback = {}) {
  if (!bridge?.address) {
    return {
      id: null,
      firstName: fallback.firstName || '',
      lastName: fallback.lastName || '',
      companyName: fallback.companyName || '',
      address: '',
      region: '',
      city: '',
      zipCode: '',
      email: fallback.email || '',
      phone: fallback.phone || '',
      country: 'Portugal',
    }
  }

  const a = bridge.address
  const contact = decodeAddressContact(a.title)
  return {
    id: a.id,
    firstName: contact.firstName || fallback.firstName || '',
    lastName: contact.lastName || fallback.lastName || '',
    companyName: contact.companyName || fallback.companyName || '',
    address: a.streetAddress || '',
    region: a.state || '',
    city: a.city || '',
    zipCode: a.zipCode || '',
    email: contact.email || fallback.email || '',
    phone: contact.phone || fallback.phone || '',
    country: a.country || 'Portugal',
  }
}

export function mapBuyerProfile(user, bridges, baseUrl, absolutizeUrl) {
  const { firstName, lastName } = splitName(user.name)
  const profileAddr = bridges.find((b) => b.addressType === 'PROFILE')
  const billing = bridges.find(
    (b) => b.addressType === 'BILLING' && b.isDefault,
  ) || bridges.find((b) => b.addressType === 'BILLING')
  const shipping = bridges.find(
    (b) => b.addressType === 'SHIPPING' && b.isDefault,
  ) || bridges.find((b) => b.addressType === 'SHIPPING')

  const accountLoc = profileAddr?.address || shipping?.address || null
  const companyName = user.profile?.companyName || ''

  return {
    firstName,
    lastName,
    email: user.email,
    phone: user.phoneNumber || '',
    region: accountLoc?.state || '',
    city: accountLoc?.city || '',
    zipCode: accountLoc?.zipCode || '',
    address: accountLoc?.streetAddress || '',
    avatarUrl: user.image ? absolutizeUrl(user.image, baseUrl) : null,
    iban: user.profile?.ibanNumber || '',
    ibanPhone: user.profile?.ibanPhone || '',
    companyName,
    billingAddress: mapBuyerAddressCard(billing, {
      firstName,
      lastName,
      companyName,
      email: user.email,
      phone: user.phoneNumber || '',
    }),
    shippingAddress: mapBuyerAddressCard(shipping, {
      firstName,
      lastName,
      companyName,
      email: user.email,
      phone: user.phoneNumber || '',
    }),
  }
}
