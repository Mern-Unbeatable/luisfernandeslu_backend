import { dateStamp } from './dates.js'

function timePart() {
  return Date.now().toString(36).toUpperCase()
}

function randomPart(length) {
  return Math.random().toString(36).slice(2, 2 + length).toUpperCase()
}

export function checkoutNumber() {
  return `CHK-${timePart()}-${randomPart(4)}`
}

/**
 * `suffix` marks the origin of the order: a seller index for cart checkout,
 * `Q` for quote conversion, `F` for factory conversion.
 */
export function orderNumber(suffix) {
  const base = `ORD-${timePart()}-${randomPart(3)}`
  return suffix != null ? `${base}-${suffix}` : base
}

/**
 * `INV-20260817-A1B2C3` — the tail is the last 6 alphanumerics of the order
 * number so an invoice can be traced back to its order by eye.
 * `audience` appends `-C` (buyer copy) or `-S` (supplier copy) when given.
 */
export function invoiceNumber(orderNo, { prefix = 'INV', audience } = {}) {
  const tail =
    String(orderNo || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-6)
      .toUpperCase() || timePart()

  const parts = [prefix, dateStamp(), tail]
  if (audience) parts.push(audience === 'CUSTOMER' ? 'C' : 'S')
  return parts.join('-')
}
