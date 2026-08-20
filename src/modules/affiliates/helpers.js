import { randomBytes } from 'crypto'
import { env } from '../../config/env.js'

/** Referral commission window: months after referred user registers. */
export const REFERRAL_ACTIVE_MONTHS = 2

export function addMonths(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export function referralExpiryDate(registeredAt) {
  return addMonths(registeredAt, REFERRAL_ACTIVE_MONTHS)
}

export function isReferralActive(registeredAt, now = new Date()) {
  return referralExpiryDate(registeredAt) > now
}

export function activeSinceDate(now = new Date()) {
  return addMonths(now, -REFERRAL_ACTIVE_MONTHS)
}

/** Pick highest qualifying tier for active client count. */
export function resolveTier(tiers, activeClientCount) {
  const sorted = [...(tiers || [])]
    .filter((t) => t.isActive !== false)
    .sort((a, b) => b.minActiveClients - a.minActiveClients)
  return (
    sorted.find((t) => activeClientCount >= t.minActiveClients) ||
    sorted[sorted.length - 1] ||
    null
  )
}

export function nextTier(tiers, activeClientCount) {
  const ascending = [...(tiers || [])]
    .filter((t) => t.isActive !== false)
    .sort((a, b) => a.minActiveClients - b.minActiveClients)
  return ascending.find((t) => t.minActiveClients > activeClientCount) || null
}

export function generateReferralCode(prefix = 'AFF') {
  const raw = randomBytes(4).toString('hex').toUpperCase()
  return `${prefix}${raw}`
}

export function generateTrackingCode() {
  return `TRK-${randomBytes(5).toString('hex').toUpperCase()}`
}

/** Marketplace share URL for an affiliate referral code. */
export function buildShareLink(referralCode) {
  const base = env.frontendUrl || 'http://localhost:5173'
  const code = encodeURIComponent(String(referralCode || '').trim())
  return `${base}/ref?code=${code}`
}

export function dateOnly(d) {
  if (!d) return null
  const x = new Date(d)
  if (Number.isNaN(x.getTime())) return null
  return x.toISOString().slice(0, 10)
}

export function moneyLabel(n) {
  const v = Number(n || 0)
  return `$${v.toFixed(2)}`
}
