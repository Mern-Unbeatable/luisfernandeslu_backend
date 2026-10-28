import supplierDeliveryService from './supplier-delivery.service.js'
import auctionService from '../auctions/services/auction.service.js'

const INTERVAL_MS = 30_000

let timer = null
let running = false

async function tick() {
  if (running) return
  running = true
  try {
    await supplierDeliveryService.sendUndecidedToCarriers()
    await auctionService.finalizeExpiredBatch()
  } catch (err) {
    console.error('[delivery-scheduler]', err.message)
  } finally {
    running = false
  }
}

/** Sends undecided supplier orders to carriers and closes expired auctions without waiting for a page view. */
export function startDeliveryScheduler() {
  if (timer) return
  timer = setInterval(tick, INTERVAL_MS)
  timer.unref?.()
}

export function stopDeliveryScheduler() {
  if (timer) clearInterval(timer)
  timer = null
}
