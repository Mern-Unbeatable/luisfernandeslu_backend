/** The marketplace trades in euro only. */
export const CURRENCY = 'EUR'
const CURRENCY_SYMBOL = '\u20ac'

/**
 * Rounds to 2 decimals. Nullish and non-numeric input become 0, and negative
 * values are preserved — use for refunds, adjustments and display totals.
 */
export function money(n) {
  const value = Number(n)
  return Number((Number.isFinite(value) ? value : 0).toFixed(2))
}

/**
 * Rounds to 2 decimals and floors at 0. Use for cart, checkout and payment
 * amounts, where a discount must never push a total below zero.
 */
export function moneyNonNegative(n) {
  return Math.max(0, money(n))
}

export function currencySymbol() {
  return CURRENCY_SYMBOL
}

export function formatMoney(n) {
  return `${CURRENCY_SYMBOL}${money(n).toFixed(2)}`
}

export function moneyText(n) {
  return money(n).toFixed(2)
}
