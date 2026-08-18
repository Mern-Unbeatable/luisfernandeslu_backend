export function formatAddressLine(a) {
  if (!a) return null
  return [a.streetAddress, a.city, a.state, a.zipCode, a.country]
    .filter(Boolean)
    .join(', ')
}

export function mapAddress(a) {
  if (!a) return null
  return {
    id: a.id,
    title: a.title,
    streetAddress: a.streetAddress,
    city: a.city,
    state: a.state,
    zipCode: a.zipCode,
    country: a.country,
  }
}
