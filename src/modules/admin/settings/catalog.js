/** Unloading / vehicle types from checkout `UNLOADING_TYPE_OPTIONS`. */

import { env } from '../../../config/env.js'

export const SETTINGS_KEY = 'admin.settings'

export const VEHICLE_TYPES = [
  { id: 'crane-12', vehicle: 'Crane (12m)' },
  { id: 'crane-24', vehicle: 'Crane (24m)' },
  { id: 'tipper', vehicle: 'Tipper Truck' },
  { id: 'forklift', vehicle: 'Forklift' },
  { id: 'manual', vehicle: 'Manual Unloading' },
]

export const VEHICLE_TYPE_IDS = VEHICLE_TYPES.map((item) => item.id)

const auctionMins = Math.max(1, Number(env.auctionDurationMinutes) || 1)

export const DEFAULT_DELIVERY_DECISION_MINUTES = 10
export const SELF_DELIVERY_HOURS = 2

export const SETTINGS_DEFAULTS = {
  shipping: {
    vehicleRates: VEHICLE_TYPES.map((item) => ({
      id: item.id,
      vehicle: item.vehicle,
      perKmCharge: Number(env.transportPricePerKm) || 0,
    })),
  },
  vat: {
    defaultRate: 25,
  },
  auction: {
    hours: Math.floor(auctionMins / 60),
    minutes: auctionMins % 60,
    decisionMinutes: DEFAULT_DELIVERY_DECISION_MINUTES,
  },
}
