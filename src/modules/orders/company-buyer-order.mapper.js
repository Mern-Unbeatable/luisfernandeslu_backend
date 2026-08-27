import { money } from '../../shared/money.js'
import { formatAddressLine } from '../../shared/address.js'
import { buildInstallmentPayload } from './installments.js'
import {
  mapDeliveryTimeline,
  mapDriver,
} from './buyer-order.mapper.js'

/** Company Orders table status keys (Figma). */
export function companyUiStatus(orderStatus) {
  const s = String(orderStatus || '').toUpperCase()
  if (s === 'NEW' || s === 'PENDING') return 'pending'
  if (
    ['PROCESSING', 'IN_PRODUCTION', 'PRODUCED', 'READY'].includes(s)
  ) {
    return 'progress'
  }
  if (['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'].includes(s)) return 'assign'
  if (s === 'DELIVERED' || s === 'COMPLETED') return 'completed'
  if (s === 'CANCELLED') return 'cancelled'
  return 'pending'
}

export function companyStatusFilter(raw) {
  if (!raw || raw === 'all') return null
  const s = String(raw).trim().toLowerCase()
  if (s === 'pending') return { in: ['NEW', 'PENDING'] }
  if (s === 'progress') {
    return { in: ['PROCESSING', 'IN_PRODUCTION', 'PRODUCED', 'READY'] }
  }
  if (s === 'assign' || s === 'assigned') {
    return { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] }
  }
  if (s === 'completed' || s === 'delivered') {
    return { in: ['DELIVERED', 'COMPLETED'] }
  }
  if (s === 'cancelled' || s === 'cancel') return 'CANCELLED'
  const upper = String(raw).trim().toUpperCase()
  return upper || null
}

function primaryLine(order) {
  return order.orderLineItems?.[0] || null
}

function quantityLabel(line) {
  if (!line) return null
  const unit = line.product?.unitOfMeasure || 'pcs'
  return `${line.quantity} ${unit}`
}

function projectNameOf(order) {
  return (
    order.project?.projectName ||
    order.checkoutSession?.project?.projectName ||
    null
  )
}

function projectAddressOf(order) {
  return (
    order.project?.location ||
    order.checkoutSession?.project?.location ||
    formatAddressLine(order.shippingAddress) ||
    null
  )
}

export function mapCompanyOrderListItem(order) {
  const line = primaryLine(order)
  const product = line?.product || null
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    productName: product?.title || null,
    quantity: line?.quantity ?? null,
    quantityLabel: quantityLabel(line),
    unit: product?.unitOfMeasure || null,
    status: companyUiStatus(order.orderStatus),
    orderStatus: order.orderStatus,
    projectName: projectNameOf(order),
    projectAddress: projectAddressOf(order),
    createdAt: order.createdAt,
  }
}

function mapCompanyPayment(order) {
  const plan = buildInstallmentPayload(order)
  const total = money(order.grandTotal)

  if (!plan.hasInstallment || !plan.payment) {
    return {
      total,
      installmentMonths: null,
      payNow: total,
      remaining: 0,
      monthly: null,
      note: null,
    }
  }

  const p = plan.payment
  const months = p.termMonths || null
  const monthly =
    months && plan.installments?.length
      ? money(
          plan.installments.reduce((s, i) => s + Number(i.amount || 0), 0) /
            plan.installments.length,
        )
      : null

  return {
    total: money(p.totalPrice ?? total),
    installmentMonths: months,
    payNow: money(p.downPayment),
    remaining: money(p.remainingBalance),
    monthly,
    note: p.paidNote || null,
  }
}

export function mapCompanyOrderDetail(order, transporter) {
  const line = primaryLine(order)
  const product = line?.product || null
  const payment = mapCompanyPayment(order)
  const progressSteps = mapDeliveryTimeline(order)

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: companyUiStatus(order.orderStatus),
    orderStatus: order.orderStatus,
    productName: product?.title || null,
    quantity: line?.quantity ?? null,
    quantityLabel: quantityLabel(line),
    unit: product?.unitOfMeasure || null,
    projectName: projectNameOf(order),
    deliveryLocation: projectAddressOf(order),
    total: payment.total,
    installmentMonths: payment.installmentMonths,
    payment: {
      payNow: payment.payNow,
      remaining: payment.remaining,
      monthly: payment.monthly,
      months: payment.installmentMonths,
      note: payment.note,
    },
    unloadingType: order.unloadingType || null,
    accessConditions: order.siteConditions || null,
    driver: mapDriver(order, transporter),
    progressSteps,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  }
}
