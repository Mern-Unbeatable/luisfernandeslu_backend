import prisma from '../../../../lib/prisma.js'
import { env } from '../../../config/env.js'
import { moneyNonNegative as money } from '../../../shared/money.js'
import { SETTINGS_DEFAULTS, SETTINGS_KEY, VEHICLE_TYPES } from './catalog.js'

let cache = null

function cloneDefaults() {
  return structuredClone(SETTINGS_DEFAULTS)
}

function mergeVehicleRates(rawRates) {
  const byId = new Map(
    (Array.isArray(rawRates) ? rawRates : []).map((row) => [row.id, row]),
  )
  return VEHICLE_TYPES.map((item) => {
    const saved = byId.get(item.id)
    const fallback = SETTINGS_DEFAULTS.shipping.vehicleRates.find(
      (row) => row.id === item.id,
    )
    return {
      id: item.id,
      vehicle: item.vehicle,
      perKmCharge: money(
        saved?.perKmCharge ?? fallback?.perKmCharge ?? env.transportPricePerKm,
      ),
    }
  })
}

function normalize(raw) {
  const defaults = cloneDefaults()
  const src = raw && typeof raw === 'object' ? raw : {}
  const hours = Number(src.auction?.hours)
  const minutes = Number(src.auction?.minutes)
  const decisionMinutes = Number(src.auction?.decisionMinutes)
  return {
    shipping: {
      vehicleRates: mergeVehicleRates(src.shipping?.vehicleRates),
    },
    vat: {
      defaultRate: money(src.vat?.defaultRate ?? defaults.vat.defaultRate),
    },
    auction: {
      hours: Number.isFinite(hours) ? Math.max(0, Math.trunc(hours)) : defaults.auction.hours,
      minutes: Number.isFinite(minutes)
        ? Math.min(59, Math.max(0, Math.trunc(minutes)))
        : defaults.auction.minutes,
      decisionMinutes: Number.isFinite(decisionMinutes) && decisionMinutes >= 1
        ? Math.min(1440, Math.trunc(decisionMinutes))
        : defaults.auction.decisionMinutes,
    },
  }
}

function parseValue(value) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function invalidateSettingsCache() {
  cache = null
}

export async function loadPlatformSettings() {
  if (cache) return cache
  const row = await prisma.systemSetting.findUnique({
    where: { key: SETTINGS_KEY },
    select: { value: true },
  })
  cache = normalize(parseValue(row?.value))
  return cache
}

export async function savePlatformSettings(next) {
  const value = JSON.stringify(next)
  await prisma.systemSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value },
    update: { value },
  })
  cache = next
  return next
}

export function auctionDurationMinutes(settings) {
  const total =
    Number(settings?.auction?.hours || 0) * 60 +
    Number(settings?.auction?.minutes || 0)
  return Math.max(1, total)
}

export function deliveryDecisionMinutes(settings) {
  return Math.max(1, Number(settings?.auction?.decisionMinutes) || 1)
}

export function rateForVehicle(settings, vehicleType) {
  const row = (settings?.shipping?.vehicleRates || []).find(
    (item) => item.id === vehicleType,
  )
  return money(row?.perKmCharge ?? env.transportPricePerKm)
}

const AUCTION_VEHICLE_TO_RATE = {
  CRANE_TRUCK: 'crane-12',
  TIPPER: 'tipper',
  HEAVY_TRUCK: 'tipper',
  FLATBED: 'forklift',
  VAN: 'manual',
}

export function auctionPricePerKm(settings, requiredVehicleType) {
  const mapped = AUCTION_VEHICLE_TO_RATE[String(requiredVehicleType || '')]
  if (mapped) {
    const rate = rateForVehicle(settings, mapped)
    if (rate > 0) return rate
  }
  const first = settings?.shipping?.vehicleRates?.[0]?.perKmCharge
  return money(first ?? env.transportPricePerKm)
}

export async function resolveVatRate(userVat) {
  const custom = Number(userVat)
  if (Number.isFinite(custom) && custom > 0) return custom
  const settings = await loadPlatformSettings()
  return money(settings.vat.defaultRate)
}
