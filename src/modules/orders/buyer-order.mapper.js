import { money } from '../../shared/money.js'
import { absolutizeUrl } from '../../lib/requestUrl.js'
import { mapProductMedia } from '../listings/read.js'

const CANCELABLE = new Set(['NEW', 'PENDING', 'PROCESSING'])

const TIMELINE_STEPS = [
  {
    id: 'confirmed',
    label: 'Order Confirmed',
    statuses: ['NEW', 'PENDING'],
    minRank: 0,
  },
  {
    id: 'dispatch',
    label: 'Ready for Dispatch',
    statuses: ['PROCESSING', 'IN_PRODUCTION', 'PRODUCED', 'READY'],
    minRank: 2,
  },
  {
    id: 'picked',
    label: 'Picked Up',
    statuses: ['ASSIGNED', 'PICKED_UP'],
    minRank: 3,
  },
  {
    id: 'transit',
    label: 'In Transit',
    statuses: ['IN_TRANSIT'],
    minRank: 4,
  },
  {
    id: 'delivered',
    label: 'Delivered',
    statuses: ['DELIVERED', 'COMPLETED'],
    minRank: 5,
  },
]

const STATUS_RANK = {
  NEW: 0,
  PENDING: 1,
  PROCESSING: 2,
  IN_PRODUCTION: 2,
  PRODUCED: 2,
  READY: 2,
  ASSIGNED: 3,
  PICKED_UP: 3,
  IN_TRANSIT: 4,
  DELIVERED: 5,
  COMPLETED: 5,
  CANCELLED: -1,
}

export function uiStatus(orderStatus) {
  const s = String(orderStatus || '').toUpperCase()
  if (CANCELABLE.has(s) || ['IN_PRODUCTION', 'PRODUCED', 'READY'].includes(s)) {
    return 'processing'
  }
  if (['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'].includes(s)) return 'shipped'
  if (['DELIVERED', 'COMPLETED'].includes(s)) return 'delivered'
  if (s === 'CANCELLED') return 'cancelled'
  return s.toLowerCase() || 'processing'
}

export function buyerOrderActions(order, hasInvoice) {
  const s = String(order.orderStatus || '').toUpperCase()
  const ui = uiStatus(s)
  return {
    canCancel: CANCELABLE.has(s),
    canTrack: s !== 'CANCELLED',
    canReview: ui === 'delivered',
    canDownloadInvoice: Boolean(hasInvoice),
  }
}

function primaryProduct(order) {
  return order.orderLineItems?.[0]?.product || null
}

function productImage(product, baseUrl) {
  if (!product) return null
  const { bannerImage, images } = mapProductMedia(product, baseUrl)
  return bannerImage?.url || images[0]?.url || null
}

function productDescription(product) {
  if (!product) return null
  const raw = product.shortDescription || product.longDescription || null
  if (!raw) return null
  return raw.length > 160 ? `${raw.slice(0, 157).trim()}...` : raw
}

export function mapBuyerOrderListItem(order, baseUrl) {
  const product = primaryProduct(order)
  const invoice = order.invoices?.[0] || null
  const hasInvoice = Boolean(invoice?.pdfUrl)

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: uiStatus(order.orderStatus),
    orderStatus: order.orderStatus,
    image: productImage(product, baseUrl),
    title: product?.title || null,
    description: productDescription(product),
    price: money(order.grandTotal),
    hasInvoice,
    invoiceId: hasInvoice ? invoice.id : null,
    actions: buyerOrderActions(order, hasInvoice),
    createdAt: order.createdAt,
  }
}

function recipientName(order) {
  const session = order.checkoutSession
  const fromSession = [session?.firstName, session?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim()
  return fromSession || order.customer?.name || null
}

function recipientPhone(order) {
  return order.checkoutSession?.phone || order.customer?.phoneNumber || null
}

export function mapShippingAddress(order) {
  const a = order.shippingAddress
  if (!a) return null
  const lines = [
    a.streetAddress,
    [a.city, a.state, a.zipCode].filter(Boolean).join(', '),
    a.country,
  ].filter(Boolean)

  return {
    name: recipientName(order),
    phone: recipientPhone(order),
    streetAddress: a.streetAddress,
    city: a.city,
    state: a.state,
    zipCode: a.zipCode,
    country: a.country,
    lines,
  }
}

export function mapBuyerLineItems(order) {
  return (order.orderLineItems || []).map((li) => {
    const unit = li.product?.unitOfMeasure || 'pcs'
    const weight =
      li.product?.weightKg != null && Number(li.product.weightKg) > 0
        ? Number(li.product.weightKg)
        : null
    return {
      id: li.id,
      productId: li.productId,
      name: li.product?.title || null,
      quantity: li.quantity,
      unit,
      weightKg: weight,
      price: money(li.totalPriceLocked),
      unitPrice: money(li.unitPriceLocked),
    }
  })
}

export function mapDriver(order, transporter) {
  if (!transporter) return null
  const plate = order.shipment?.vehicle?.licensePlate
  return {
    id: transporter.id,
    name: transporter.name || null,
    phone: transporter.phone || null,
    vehicle: plate ? `Truck #${plate}` : transporter.vehicle || null,
  }
}

function historyAt(statusHistory, statuses) {
  const set = new Set(statuses)
  const hit = (statusHistory || []).find((h) => set.has(h.status))
  return hit?.createdAt || null
}

export function mapDeliveryTimeline(order) {
  if (order.orderStatus === 'CANCELLED') {
    const cancelledAt =
      historyAt(order.statusHistory, ['CANCELLED']) || order.updatedAt
    return [
      {
        id: 'cancelled',
        label: 'Order Cancelled',
        at: cancelledAt,
        completed: true,
      },
    ]
  }

  const rank = STATUS_RANK[order.orderStatus] ?? 0
  const events = order.shipment?.trackingEvents || []

  return TIMELINE_STEPS.map((step) => {
    let at = historyAt(order.statusHistory, step.statuses)
    if (!at && step.id === 'picked') {
      const ev = events.find((e) =>
        /pick/i.test(String(e.statusText || '')),
      )
      at = ev?.timestamp || null
    }
    if (!at && step.id === 'transit') {
      const ev = events.find((e) =>
        /transit|navigat/i.test(String(e.statusText || '')),
      )
      at = ev?.timestamp || order.shipment?.tripStartedAt || null
    }
    if (!at && step.id === 'delivered') {
      const ev = events.find((e) =>
        /deliver/i.test(String(e.statusText || '')),
      )
      at = ev?.timestamp || null
    }
    if (!at && step.id === 'confirmed') {
      at = order.createdAt
    }

    const completed = rank >= step.minRank
    return {
      id: step.id,
      label: step.label,
      at: completed ? at : null,
      completed,
    }
  })
}

export function mapBuyerInvoice(invoice, baseUrl) {
  if (!invoice?.pdfUrl) return null
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    pdfUrl: absolutizeUrl(invoice.pdfUrl, baseUrl),
  }
}

/** Certified InvoiceXpress invoice — only once finalized (drafts are internal). */
export function mapBuyerTaxInvoice(row) {
  if (row?.status !== 'FINALIZED' || !row.permalink) return null
  return {
    number: row.sequenceNumber,
    atcud: row.atcud,
    url: row.permalink,
    issuedAt: row.finalizedAt,
  }
}

export function mapBuyerOrderDetail(order, baseUrl, transporter) {
  const invoice = order.invoices?.[0] || null
  const mappedInvoice = mapBuyerInvoice(invoice, baseUrl)
  const hasInvoice = Boolean(mappedInvoice)

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: uiStatus(order.orderStatus),
    orderStatus: order.orderStatus,
    shippingAddress: mapShippingAddress(order),
    products: mapBuyerLineItems(order),
    total: money(order.grandTotal),
    subTotal: money(order.subTotal),
    shippingFee: money(order.shippingFee),
    vatAmount: money(order.vatAmount),
    discountAmount: money(order.discountAmount),
    driver: mapDriver(order, transporter),
    timeline: mapDeliveryTimeline(order),
    hasInvoice,
    invoice: mappedInvoice,
    taxInvoice: mapBuyerTaxInvoice(order.taxInvoice),
    cancellationReason: order.cancellationReason || null,
    deliveryOtp:
      order.orderStatus === 'IN_TRANSIT' ? order.otpVerificationCode : null,
    actions: buyerOrderActions(order, hasInvoice),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  }
}

export { CANCELABLE }
