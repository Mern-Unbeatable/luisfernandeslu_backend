import { env } from '../config/env.js'

const CURRENCY_SYMBOLS = {
  EUR: '\u20ac',
  USD: '$',
  GBP: '\u00a3',
  BRL: 'R$',
}

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

export function currencySymbol(currency = env.currency) {
  return CURRENCY_SYMBOLS[String(currency).toUpperCase()] || ''
}

export function formatMoney(n, currency = env.currency) {
  return `${currencySymbol(currency)}${money(n).toFixed(2)}`
}

export function moneyText(n) {
  return money(n).toFixed(2)
}
