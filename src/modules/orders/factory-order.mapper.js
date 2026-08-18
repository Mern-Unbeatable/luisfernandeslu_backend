import { money } from '../../shared/money.js'
import { companyDisplayName } from '../../shared/party.js'
import { formatAddressLine } from '../../shared/address.js'
import { ordinalLabel } from '../../shared/ordinal.js'
import { CURRENCY } from './mappers.js'
import { factoryStatusLabel } from './factory-status-rules.js'

function splitQuantities(totalQty, amounts) {
  const totalAmount = amounts.reduce((s, n) => s + Number(n || 0), 0)
  if (!amounts.length) return []
  if (!totalQty || !totalAmount) return amounts.map(() => 0)

  const qty = []
  let used = 0
  for (let i = 0; i < amounts.length; i += 1) {
    if (i === amounts.length - 1) {
      qty.push(Math.max(0, totalQty - used))
      break
    }
    const share = Math.round((Number(amounts[i] || 0) / totalAmount) * totalQty)
    qty.push(share)
    used += share
  }
  return qty
}

function lineVat(order, lineTotal) {
  const sub = Number(order.subTotal || order.grandTotal || 0)
  const vat = Number(order.vatAmount || 0)
  if (!sub || !vat) return 0
  return money((Number(lineTotal || 0) / sub) * vat)
}

function installmentQty(inst, line, splitQty) {
  const bridge = (inst.fulfillmentBridge || []).find(
    (b) => b.orderLineItem?.id === line.id || b.orderLineItemId === line.id,
  )
  if (bridge?.allocatedQuantity != null) return Number(bridge.allocatedQuantity)
  return splitQty
}

export function mapFactoryOrderDetail(order, viewer) {
  const ship = order.shippingAddress
  const session = order.checkoutSession
  const lines = order.orderLineItems || []
  const plan = order.paymentPlan
  const installments = [...(plan?.installments || [])].sort(
    (a, b) => a.installmentNumber - b.installmentNumber,
  )
  const paidAmount = money(
    installments
      .filter((i) => i.status === 'COMPLETED')
      .reduce((s, i) => s + Number(i.amount || 0), 0),
  )
  const totalOrderAmount = money(plan?.totalAmount || order.grandTotal)
  const remainingAmount = money(
    Number(plan?.remainingBalance ?? totalOrderAmount - paidAmount),
  )
  const shippingLabel =
    Number(order.shippingFee || 0) > 0 ? money(order.shippingFee) : 'Included'

  const products = lines.map((li) => {
    const amount = money(li.totalPriceLocked)
    const vat = lineVat(order, amount)
    const net = money(amount - vat)
    const unit = li.product?.unitOfMeasure || null
    return {
      product: li.product?.title || null,
      quantity: li.quantity,
      shipping: shippingLabel,
      uom: unit,
      unitPrice: money(li.unitPriceLocked),
      amount,
      vat,
      net,
      total: money(amount + vat),
    }
  })

  const amounts = installments.map((i) => i.amount)
  const installmentBreakdown = []
  const timeline = []

  for (let i = 0; i < installments.length; i += 1) {
    const inst = installments[i]
    const paid = inst.status === 'COMPLETED'
    let timelineQty = 0

    for (const li of lines) {
      const splits = splitQuantities(Number(li.quantity || 0), amounts)
      const quantity = installmentQty(inst, li, splits[i] || 0)
      timelineQty += quantity
      const unit = li.product?.unitOfMeasure || null
      const orderTotal = Number(order.grandTotal || plan?.totalAmount || 0)
      const lineShare = orderTotal
        ? Number(li.totalPriceLocked || 0) / orderTotal
        : 1
      installmentBreakdown.push({
        product: li.product?.title || null,
        quantity,
        delivery: paid ? 'Shipped' : 'Pending',
        uom: unit,
        unitPrice: money(li.unitPriceLocked),
        amount: money(Number(inst.amount || 0) * lineShare),
      })
    }

    timeline.push({
      id: inst.id,
      title: ordinalLabel(inst.installmentNumber),
      status: paid ? 'Paid' : 'Pending',
      date: paid ? inst.paidAt : inst.dueDate,
      amount: money(inst.amount),
      quantity: timelineQty,
      actions: {
        canView: paid,
        canPay: !paid && viewer === 'supplier',
        canCancel: !paid && viewer === 'supplier',
      },
    })
  }

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderDate: order.createdAt,
    orderStatus: order.orderStatus,
    status: factoryStatusLabel(order.orderStatus),
    supplier: {
      name: companyDisplayName(order.customer),
      email: session?.email || order.customer?.email || null,
      phone: session?.phone || order.customer?.phoneNumber || null,
      address: ship?.streetAddress || formatAddressLine(ship),
      region: ship?.state || null,
      zipCode: ship?.zipCode || null,
      country: ship?.country || null,
    },
    payment: {
      totalOrderAmount,
      paymentStatus: remainingAmount > 0 ? 'PENDING' : 'PAID',
      remainingAmount,
      currency: CURRENCY,
    },
    products,
    installmentBreakdown,
    installments: timeline,
  }
}
