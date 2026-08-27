import { money } from '../../shared/money.js'
import { buildInstallmentPayload } from '../orders/installments.js'
import { companyUiStatus } from '../orders/company-buyer-order.mapper.js'
import { mapDriver, mapDeliveryTimeline } from '../orders/buyer-order.mapper.js'

function primaryLine(order) {
  return order.orderLineItems?.[0] || null
}

function quantityLabel(line) {
  if (!line) return null
  const unit = line.product?.unitOfMeasure || 'pcs'
  return `${line.quantity} ${unit}`
}

function orderDuePayment(order) {
  const plan = order.paymentPlan
  if (!plan) return 0
  if (plan.remainingBalance != null) return money(plan.remainingBalance)
  const unpaid = (plan.installments || [])
    .filter((i) => i.status !== 'COMPLETED')
    .reduce((s, i) => s + Number(i.amount || 0), 0)
  return money(unpaid)
}

function orderDeliveredValue(order) {
  const s = String(order.orderStatus || '')
  if (['DELIVERED', 'COMPLETED'].includes(s)) return money(order.grandTotal)
  const plan = order.paymentPlan
  if (plan) {
    const paid = (plan.installments || [])
      .filter((i) => i.status === 'COMPLETED')
      .reduce((sum, i) => sum + Number(i.amount || 0), 0)
    return money(paid)
  }
  return 0
}

export function mapProjectSuggestion(project) {
  return {
    id: project.id,
    projectName: project.projectName,
    location: project.location,
  }
}

export function mapProjectListItem(project, stats) {
  return {
    id: project.id,
    name: project.projectName,
    projectName: project.projectName,
    address: project.location,
    location: project.location,
    categoryLabel: 'Construction Materials',
    orderCount: stats.orderCount,
    materialTypes: stats.materialTypes,
    deliveredValue: stats.deliveredValue,
    duePayment: stats.duePayment,
    createdAt: project.createdAt,
  }
}

export function mapProjectOrderRow(order) {
  const line = primaryLine(order)
  const due = orderDuePayment(order)
  return {
    id: order.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    materialName: line?.product?.title || null,
    orderedQuantity: quantityLabel(line),
    quantity: line?.quantity ?? null,
    unit: line?.product?.unitOfMeasure || null,
    deliveredValue: orderDeliveredValue(order),
    duePayment: due,
    duePaymentLabel: due <= 0 ? 'Fully Paid' : null,
    status: companyUiStatus(order.orderStatus),
    orderStatus: order.orderStatus,
    createdAt: order.createdAt,
  }
}

export function mapProjectDetail(project, orders, stats) {
  return {
    id: project.id,
    name: project.projectName,
    projectName: project.projectName,
    location: project.location,
    materialTypes: stats.materialTypes,
    deliveredValue: stats.deliveredValue,
    duePayment: stats.duePayment,
    orderCount: stats.orderCount,
    orders: orders.map(mapProjectOrderRow),
    // UI table alias used by demo as "materials"
    materials: orders.map(mapProjectOrderRow),
    createdAt: project.createdAt,
  }
}

export function mapProjectOrderDetail(order, transporter) {
  const line = primaryLine(order)
  const installment = buildInstallmentPayload(order)
  const payment = installment.payment
  const total = money(order.grandTotal)
  const paidAmount = payment ? money(payment.paidAmount) : 0
  const remaining = payment ? money(payment.remainingBalance) : 0
  const progressPercent =
    total > 0 ? Math.round((paidAmount / total) * 100) : 0

  const installments = (installment.installments || []).map((i) => ({
    id: i.id,
    title: i.title,
    installmentNumber: i.installmentNumber,
    status: String(i.status || '').toLowerCase() === 'completed'
      ? 'completed'
      : 'pending',
    dueDate: i.dueDate,
    amount: i.amount,
    quantity: quantityLabel(line),
    canPayNow: i.status === 'PENDING' || i.status === 'OVERDUE',
    isPaid: Boolean(i.isPaid),
  }))

  const nextPending = installments.find((i) => i.canPayNow)

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: companyUiStatus(order.orderStatus),
    orderStatus: order.orderStatus,
    materialName: line?.product?.title || null,
    productName: line?.product?.title || null,
    quantity: line?.quantity ?? null,
    quantityLabel: quantityLabel(line),
    unit: line?.product?.unitOfMeasure || null,
    projectId: order.projectId || order.project?.id || null,
    projectName: order.project?.projectName || null,
    deliveryLocation: order.project?.location || null,
    supplierName: order.seller?.profile?.companyName || order.seller?.name || null,
    total,
    installmentMonths: payment?.termMonths || null,
    planLabel: payment?.termMonths ? `${payment.termMonths} Months Plan` : null,
    planRange: null,
    reminder: nextPending
      ? {
          title: 'Upcoming Payment Reminder',
          amount: nextPending.amount,
          dueDate: nextPending.dueDate,
        }
      : null,
    paymentSummary: {
      totalAmount: total,
      paidAmount,
      remainingBalance: remaining,
      progressPercent,
      nextInstallmentDate: nextPending?.dueDate || null,
      monthlyPayment: payment
        ? money(
            (installment.installments || []).reduce(
              (s, i) => s + Number(i.amount || 0),
              0,
            ) / Math.max(1, (installment.installments || []).length),
          )
        : null,
      note: payment?.paidNote || null,
    },
    payment: {
      payNow: payment ? money(payment.downPayment) : total,
      remaining,
      monthly: null,
      months: payment?.termMonths || null,
      note: payment?.paidNote || null,
    },
    installments,
    unloadingType: order.unloadingType || null,
    accessConditions: order.siteConditions || null,
    driver: mapDriver(order, transporter),
    progressSteps: mapDeliveryTimeline(order),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  }
}

export function computeProjectStats(orders) {
  const productIds = new Set()
  let deliveredValue = 0
  let duePayment = 0
  for (const order of orders) {
    for (const li of order.orderLineItems || []) {
      if (li.productId) productIds.add(li.productId)
    }
    deliveredValue += orderDeliveredValue(order)
    duePayment += orderDuePayment(order)
  }
  return {
    orderCount: orders.length,
    materialTypes: productIds.size,
    deliveredValue: money(deliveredValue),
    duePayment: money(duePayment),
  }
}
