/** Display name for a chat/quote counterparty. */
export function partyName(user, fallback = 'User') {
  if (!user) return fallback
  return user.profile?.companyName?.trim() || user.name || fallback
}

/** Company name when present, otherwise the personal name. Null when neither. */
export function companyDisplayName(user) {
  return user?.profile?.companyName || user?.name || null
}

/**
 * Splits a full name for checkout/billing records. A single-word name yields
 * the same value for both parts, because those fields are non-nullable.
 */
export function splitName(fullName, fallback = 'User') {
  const parts = String(fullName || fallback).trim().split(/\s+/).filter(Boolean)
  const firstName = parts[0] || fallback
  const lastName = parts.slice(1).join(' ') || firstName
  return { firstName, lastName }
}
