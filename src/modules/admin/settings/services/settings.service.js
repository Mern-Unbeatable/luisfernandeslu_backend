import { httpError } from '../../../../shared/errors.js'
import { moneyNonNegative as money } from '../../../../shared/money.js'
import { SETTINGS_DEFAULTS, VEHICLE_TYPES } from '../catalog.js'
import {
  loadPlatformSettings,
  savePlatformSettings,
} from '../settings.store.js'

function assertAdmin(authUser) {
  if (!authUser?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(authUser.role || '').toLowerCase() !== 'admin') {
    throw httpError('Admin access required', 403, 'Forbidden')
  }
}

function applyShipping(current, vehicleRates) {
  const byId = new Map(
    (vehicleRates || []).map((row) => [row.id, row.perKmCharge]),
  )
  return {
    vehicleRates: VEHICLE_TYPES.map((item) => {
      const existing = current.shipping.vehicleRates.find((row) => row.id === item.id)
      return {
        id: item.id,
        vehicle: item.vehicle,
        perKmCharge: money(
          byId.has(item.id) ? byId.get(item.id) : existing?.perKmCharge,
        ),
      }
    }),
  }
}

export class AdminSettingsService {
  async get(authUser) {
    assertAdmin(authUser)
    const settings = await loadPlatformSettings()
    return {
      status: 200,
      body: {
        ...settings,
        message: 'Settings fetched',
      },
    }
  }

  async saveShipping(authUser, body = {}) {
    assertAdmin(authUser)
    const current = await loadPlatformSettings()
    const settings = await savePlatformSettings({
      ...current,
      shipping: applyShipping(current, body.vehicleRates),
    })
    return {
      status: 200,
      body: {
        shipping: settings.shipping,
        message: 'Shipping rates saved',
      },
    }
  }

  async saveVat(authUser, body = {}) {
    assertAdmin(authUser)
    const current = await loadPlatformSettings()
    const settings = await savePlatformSettings({
      ...current,
      vat: { defaultRate: money(body.defaultRate) },
    })
    return {
      status: 200,
      body: {
        vat: settings.vat,
        message: 'VAT rate saved',
      },
    }
  }

  async saveAuction(authUser, body = {}) {
    assertAdmin(authUser)
    const current = await loadPlatformSettings()
    const settings = await savePlatformSettings({
      ...current,
      auction: {
        hours: Number(body.hours),
        minutes: Number(body.minutes),
        decisionMinutes:
          body.decisionMinutes != null
            ? Number(body.decisionMinutes)
            : current.auction.decisionMinutes,
      },
    })
    return {
      status: 200,
      body: {
        auction: settings.auction,
        message: 'Auction duration saved',
      },
    }
  }

  async resetShipping(authUser) {
    assertAdmin(authUser)
    const current = await loadPlatformSettings()
    const settings = await savePlatformSettings({
      ...current,
      shipping: structuredClone(SETTINGS_DEFAULTS.shipping),
    })
    return {
      status: 200,
      body: {
        shipping: settings.shipping,
        message: 'Shipping rates reset',
      },
    }
  }

  async resetVat(authUser) {
    assertAdmin(authUser)
    const current = await loadPlatformSettings()
    const settings = await savePlatformSettings({
      ...current,
      vat: structuredClone(SETTINGS_DEFAULTS.vat),
    })
    return {
      status: 200,
      body: {
        vat: settings.vat,
        message: 'VAT rate reset',
      },
    }
  }

  async resetAuction(authUser) {
    assertAdmin(authUser)
    const current = await loadPlatformSettings()
    const settings = await savePlatformSettings({
      ...current,
      auction: structuredClone(SETTINGS_DEFAULTS.auction),
    })
    return {
      status: 200,
      body: {
        auction: settings.auction,
        message: 'Auction duration reset',
      },
    }
  }
}

export default new AdminSettingsService()
