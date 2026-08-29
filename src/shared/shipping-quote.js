/**
 * Customer shipping = distance(km) × admin per-km rate for chosen unloading vehicle.
 * Same amount is stored on the order and used as auction bid ceiling.
 */

import prisma from '../../lib/prisma.js'
import { httpError } from './errors.js'
import { formatAddressLine } from './address.js'
import { calculateDistance, resolveCoordinates } from './distance.js'
import { moneyNonNegative as money } from './money.js'
import {
  VEHICLE_TYPE_IDS,
  VEHICLE_TYPES,
} from '../modules/admin/settings/catalog.js'
import {
  loadPlatformSettings,
  rateForVehicle,
} from '../modules/admin/settings/settings.store.js'

const partyAddressSelect = {
  addresses: {
    include: { address: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  },
}

export function resolveVehicleRateId(unloadingType) {
  const raw = String(unloadingType || '').trim()
  if (!raw) return null
  if (VEHICLE_TYPE_IDS.includes(raw)) return raw
  const lower = raw.toLowerCase()
  const byName = VEHICLE_TYPES.find(
    (v) =>
      v.vehicle.toLowerCase() === lower ||
      v.id.toLowerCase() === lower,
  )
  return byName?.id || null
}

export function assertUnloadingVehicle(unloadingType) {
  const id = resolveVehicleRateId(unloadingType)
  if (!id) {
    throw httpError(
      `unloadingType must be one of: ${VEHICLE_TYPE_IDS.join(', ')}`,
      400,
      'InvalidUnloadingType',
    )
  }
  return id
}

function pickSellerPickup(user) {
  const bridges = user?.addresses || []
  const ranked = [...bridges].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault),
  )
  const warehouse = ranked.find(
    (b) => String(b.addressType || '').toUpperCase() === 'WAREHOUSE',
  )
  const shipping = ranked.find(
    (b) => String(b.addressType || '').toUpperCase() === 'SHIPPING',
  )
  return (
    warehouse?.address ||
    shipping?.address ||
    ranked[0]?.address ||
    null
  )
}

async function persistCoords(address, coords) {
  if (!address?.id || !coords?.geocoded) return
  await prisma.address.update({
    where: { id: address.id },
    data: { latitude: coords.latitude, longitude: coords.longitude },
  })
}

async function routeBetween(fromLoc, toLoc) {
  const pickupText =
    typeof fromLoc === 'string'
      ? fromLoc.trim()
      : formatAddressLine(fromLoc)
  const deliveryText =
    typeof toLoc === 'string' ? toLoc.trim() : formatAddressLine(toLoc)

  if (!pickupText) {
    throw httpError(
      'Seller warehouse / pickup address is missing',
      400,
      'MissingPickupAddress',
    )
  }
  if (!deliveryText) {
    throw httpError(
      'Delivery address is required to calculate shipping',
      400,
      'MissingDeliveryAddress',
    )
  }

  const fromCoords = await resolveCoordinates(fromLoc)
  if (fromCoords?.geocoded) await persistCoords(fromLoc, fromCoords)
  const toCoords = await resolveCoordinates(toLoc)
  if (toCoords?.geocoded) await persistCoords(toLoc, toCoords)

  if (!fromCoords || !toCoords) {
    throw httpError(
      'Could not geocode pickup or delivery address',
      400,
      'GeocodeFailed',
    )
  }

  const result = await calculateDistance(fromCoords, toCoords)
  return {
    distanceKm: result.distanceKm,
    pickupText,
    deliveryText,
  }
}

/**
 * @param {{
 *   sellerIds: string[],
 *   deliveryAddress: object | string,
 *   unloadingType: string,
 * }} input
 */
export async function quoteShippingForSellers({
  sellerIds,
  deliveryAddress,
  unloadingType,
}) {
  const vehicleId = assertUnloadingVehicle(unloadingType)
  const ids = [...new Set((sellerIds || []).map(String).filter(Boolean))]
  if (!ids.length) {
    throw httpError('No sellers to quote shipping for', 400, 'EmptySellers')
  }

  const settings = await loadPlatformSettings()
  const pricePerKm = money(rateForVehicle(settings, vehicleId))
  if (!(pricePerKm > 0)) {
    throw httpError(
      'Admin per-km rate for this vehicle is not configured',
      400,
      'MissingVehicleRate',
    )
  }

  const sellers = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, ...partyAddressSelect },
  })
  const sellerMap = new Map(sellers.map((s) => [s.id, s]))

  const legs = []
  let shipping = 0

  for (const sellerId of ids) {
    const seller = sellerMap.get(sellerId)
    if (!seller) {
      throw httpError('Seller not found for shipping quote', 404, 'SellerNotFound')
    }
    const pickup = pickSellerPickup(seller)
    const route = await routeBetween(pickup, deliveryAddress)
    const fee = money(Math.round(route.distanceKm * pricePerKm * 100) / 100)
    if (!(fee > 0)) {
      throw httpError(
        'Calculated shipping must be greater than 0',
        400,
        'InvalidShipping',
      )
    }
    shipping = money(shipping + fee)
    legs.push({
      sellerId,
      distanceKm: route.distanceKm,
      pricePerKm,
      shippingFee: fee,
      pickupLocation: route.pickupText,
      deliveryLocation: route.deliveryText,
    })
  }

  return {
    unloadingType: vehicleId,
    pricePerKm,
    shipping,
    distanceKm: money(
      legs.reduce((s, leg) => s + Number(leg.distanceKm || 0), 0),
    ),
    legs,
    bySeller: new Map(legs.map((leg) => [leg.sellerId, leg])),
  }
}
