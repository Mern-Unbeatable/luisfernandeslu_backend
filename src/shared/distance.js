/**
 * Distance and geocoding via Mapbox (Geocoding + Directions).
 * Requires MAPBOX_ACCESS_TOKEN in env.
 */

import { formatAddressLine } from './address.js'

const MAPBOX_GEOCODE_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places'
const MAPBOX_DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving'

function getAccessToken() {
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim()
  if (!token) {
    throw new Error('MAPBOX_ACCESS_TOKEN is not configured')
  }
  return token
}

export function hasMapboxToken() {
  return Boolean(process.env.MAPBOX_ACCESS_TOKEN?.trim())
}

function hasCoords(a) {
  return Number(a?.latitude) && Number(a?.longitude)
}

function contextValue(feature, idPrefix) {
  const hit = (feature?.context || []).find((c) =>
    String(c?.id || '').startsWith(idPrefix),
  )
  return hit?.text || null
}

/**
 * Autocomplete place suggestions for checkout project location.
 * @param {string} query
 * @param {{ limit?: number, country?: string }} [opts]
 */
export async function suggestPlaces(query, opts = {}) {
  const q = String(query || '').trim()
  if (!q) return []

  const limit = Math.min(10, Math.max(1, Number(opts.limit) || 8))
  const country = String(opts.country || 'pt').trim().toLowerCase() || 'pt'
  const token = getAccessToken()

  const params = new URLSearchParams({
    access_token: token,
    autocomplete: 'true',
    limit: String(limit),
    country,
    types: 'address,poi,place,locality,neighborhood,district,region,postcode',
    language: 'en',
  })

  const url = `${MAPBOX_GEOCODE_BASE}/${encodeURIComponent(q)}.json?${params}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    throw new Error(`Mapbox place suggestions failed: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  const features = Array.isArray(data?.features) ? data.features : []

  
  return features
    .map((f) => {
      const [longitude, latitude] = Array.isArray(f.center) ? f.center : []
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
      const placeName = String(f.place_name || f.text || '').trim()
      if (!placeName) return null
      
      const featureIdStr = String(f.id || '')
      const isPlace = featureIdStr.startsWith('place.')
      const isRegion = featureIdStr.startsWith('region.')
      const isPostcode = featureIdStr.startsWith('postcode.')
      const isLocality = featureIdStr.startsWith('locality.') || featureIdStr.startsWith('neighborhood.')
      
      const textVal = String(f.text || '').trim()
      
      return {
        id: String(f.id || `${longitude},${latitude}`),
        label: placeName,
        placeName,
        text: textVal || placeName,
        latitude: Number(latitude),
        longitude: Number(longitude),
        country: contextValue(f, 'country.'),
        region: isRegion ? textVal : (contextValue(f, 'region.') || null),
        place: isPlace ? textVal : (contextValue(f, 'place.') || (isLocality ? textVal : null)),
        postcode: isPostcode ? textVal : (contextValue(f, 'postcode.') || null),
      }
    })
    .filter(Boolean)
}

export async function geocodeAddress(address) {
  const query = typeof address === 'string' ? address.trim() : formatAddressLine(address)
  if (!query) return null

  const token = getAccessToken()
  const url = `${MAPBOX_GEOCODE_BASE}/${encodeURIComponent(query)}.json?access_token=${encodeURIComponent(token)}&limit=1`

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) {
    throw new Error(`Mapbox geocoding failed: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  const hit = Array.isArray(data?.features) ? data.features[0] : null
  const center = hit?.center
  if (!Array.isArray(center) || center.length < 2) return null

  const [longitude, latitude] = center
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
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

  const token = getAccessToken()
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`
  const url = `${MAPBOX_DIRECTIONS_BASE}/${coords}?access_token=${encodeURIComponent(token)}&overview=false`

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    throw new Error(`Mapbox directions failed: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`Mapbox could not find a route: ${data.code || 'unknown'}`)
  }

  const route = data.routes[0]
  return {
    distanceKm: Math.round((route.distance / 1000) * 100) / 100,
    durationMinutes: Math.round(route.duration / 60),
  }
}
