import { money } from '../../shared/money.js'
import { ordinalLabel } from '../../shared/ordinal.js'
import { categoryLabels } from '../../shared/catalog.js'
import { CURRENCY, weightSizeText } from './mappers.js'

export function pickCurrentInstallment(installments) {
  if (!installments?.length) return null
  const sorted = [...installments].sort(
    (a, b) => a.installmentNumber - b.installmentNumber,
  )
  return (
    sorted.find((i) => i.status === 'PENDING' || i.status === 'OVERDUE') ||
    [...sorted].reverse().find((i) => i.status === 'COMPLETED') ||
    sorted[0]
  )
}

export function buildInstallmentPayload(order) {
  const plan = order.paymentPlan
  if (!plan) {
    return {
      hasInstallment: false,
      payment: null,
      installmentBreakdown: [],
      installments: [],
    }
  }

  const installments = [...(plan.installments || [])].sort(
    (a, b) => a.installmentNumber - b.installmentNumber,
  )
  const paidAmount = money(
    installments
      .filter((i) => i.status === 'COMPLETED')
      .reduce((s, i) => s + Number(i.amount || 0), 0),
  )
  const remainingBalance = money(
    Number(plan.remainingBalance ?? plan.totalAmount - paidAmount),
  )
  const next = installments.find(
    (i) => i.status === 'PENDING' || i.status === 'OVERDUE',
  )
  const monthly =
    installments.length > 0
      ? money(
          installments.reduce((s, i) => s + Number(i.amount || 0), 0) /
            installments.length,
        )
      : null

  const paidCount = installments.filter((i) => i.status === 'COMPLETED').length
  const payment = {
    totalPrice: money(plan.totalAmount || order.grandTotal),
    downPayment: money(plan.downPayment),
    paidAmount,
    remainingBalance,
    duration: `${plan.termMonths} months`,
    termMonths: plan.termMonths,
    paidNote:
      paidCount > 0
        ? `Paid ${paidCount}/${installments.length} installment${installments.length === 1 ? '' : 's'} for ${plan.termMonths} months`
        : monthly != null
          ? `Pay ${CURRENCY === 'EUR' ? '€' : CURRENCY + ' '}${monthly.toLocaleString('en-US', { minimumFractionDigits: 2 })}/month for ${plan.termMonths} months`
          : null,
    nextDueLabel: next
      ? `Next installment due on ${new Date(next.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : null,
    currency: CURRENCY,
  }

  const timeline = installments.map((i) => ({
    id: i.id,
    installmentNumber: i.installmentNumber,
    title: ordinalLabel(i.installmentNumber),
    status: i.status,
    dueDate: i.dueDate,
    amount: money(i.amount),
    paidAt: i.paidAt || null,
    isPaid: i.status === 'COMPLETED',
    currency: CURRENCY,
  }))

  const breakdown = []
  for (const inst of installments) {
    const bridges = inst.fulfillmentBridge || []
    if (bridges.length) {
      for (const bridge of bridges) {
        const li = bridge.orderLineItem
        const labels = categoryLabels(li?.product?.category)
        const qty = bridge.allocatedQuantity
        const unit = money(li?.unitPriceLocked)
        breakdown.push({
          id: `${inst.id}-${li?.id || 'line'}`,
          productId: li?.productId || null,
          title: li?.product?.title || null,
          category: labels.category,
          material: labels.material,
          weightSize: weightSizeText(li?.product),
          quantity: qty,
          warehouseLocation:
            li?.warehouseLocation || li?.product?.warehouseLocation || null,
          installmentNumber: ordinalLabel(inst.installmentNumber),
          installmentIndex: inst.installmentNumber,
          amount: money(unit * qty),
          currency: CURRENCY,
        })
      }
    } else {
      for (const li of order.orderLineItems || []) {
        const labels = categoryLabels(li.product?.category)
        const months = Math.max(1, plan.termMonths || installments.length || 1)
        const qty = Math.floor(Number(li.quantity || 0) / months) || 0
        breakdown.push({
          id: `${inst.id}-${li.id}`,
          productId: li.productId,
          title: li.product?.title || null,
          category: labels.category,
          material: labels.material,
          weightSize: weightSizeText(li.product),
          quantity: qty,
          warehouseLocation:
            li.warehouseLocation || li.product?.warehouseLocation || null,
          installmentNumber: ordinalLabel(inst.installmentNumber),
          installmentIndex: inst.installmentNumber,
          amount: money(inst.amount),
          currency: CURRENCY,
        })
      }
    }
  }

  return {
    hasInstallment: true,
    payment,
    installmentBreakdown: breakdown,
    installments: timeline,
  }
}
