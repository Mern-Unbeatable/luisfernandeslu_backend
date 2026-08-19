/**
 * Distance and geocoding via OpenStreetMap (Nominatim + OSRM).
 */

import { formatAddressLine } from './address.js'

const OSRM_BASE = 'https://router.project-osrm.org'
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'
const OSM_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Construpreco/1.0 (factory-auction-distance)',
}

function hasCoords(a) {
  return Number(a?.latitude) && Number(a?.longitude)
}

export async function geocodeAddress(address) {
  const query = typeof address === 'string' ? address.trim() : formatAddressLine(address)
  if (!query) return null

  const url = `${NOMINATIM_BASE}/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: OSM_HEADERS,
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) {
    throw new Error(`Nominatim request failed: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  const hit = Array.isArray(data) ? data[0] : null
  if (!hit?.lat || !hit?.lon) return null

  return {
    latitude: Number(hit.lat),
    longitude: Number(hit.lon),
  }
}

export async function resolveCoordinates(address) {
  if (hasCoords(address)) {
    return {
      latitude: Number(address.latitude),
      longitude: Number(address.longitude),
      geocoded: false,
    }
  }
  const geo = await geocodeAddress(address)
  if (!geo) return null
  return { ...geo, geocoded: true }
}

/**
 * @param {{ latitude: number, longitude: number }} from
 * @param {{ latitude: number, longitude: number }} to
 * @returns {Promise<{ distanceKm: number, durationMinutes: number }>}
 */
export async function calculateDistance(from, to) {
  if (!from?.latitude || !from?.longitude || !to?.latitude || !to?.longitude) {
    throw new Error('Both addresses must have latitude and longitude for distance calculation')
  }

  const url = `${OSRM_BASE}/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=false`

  const res = await fetch(url, {
    headers: OSM_HEADERS,
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    throw new Error(`OSRM request failed: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`OSRM could not find a route: ${data.code}`)
  }

  const route = data.routes[0]
  return {
    distanceKm: Math.round((route.distance / 1000) * 100) / 100,
    durationMinutes: Math.round(route.duration / 60),
  }
}
