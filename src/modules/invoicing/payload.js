import { env } from '../../config/env.js'
import { money } from '../../shared/money.js'
import { ordinalLabel } from '../../shared/ordinal.js'
import { formatAddressLine } from '../../shared/address.js'
import { companyDisplayName } from '../../shared/party.js'

const CURRENCY = env.currency

export function sessionFallbackName(session) {
  return [session?.firstName, session?.lastName].filter(Boolean).join(' ')
}

export function defaultBuyerName(order, session, fallback = 'Customer') {
  return (
    companyDisplayName(order.customer) ||
    sessionFallbackName(session) ||
    fallback
  )
}

/**
 * One rule for the PDF total:
 * - `grand` — buyer copy (includes shipping + VAT)
 * - `net` — supplier copy / customer order (discounted subtotal, no shipping/VAT)
 * - `planOrGrand` — company order (chat plan total when present)
 */
export function resolveInvoiceTotal(order, { showShippingVat = false, totalMode } = {}) {
  const mode = totalMode || (showShippingVat ? 'grand' : 'net')
  if (mode === 'grand' || showShippingVat) return money(order.grandTotal)
  if (mode === 'planOrGrand') {
    return money(order.paymentPlan?.totalAmount || order.grandTotal)
  }
  return money(order.subTotal)
}

export function buildInvoicePayload(order, invoice, options = {}) {
  const {
    showShippingVat = false,
    includeInstallments = false,
    totalMode,
    total,
    customerName,
  } = options

  const session = order.checkoutSession
  const ship = order.shippingAddress
  const sellerAddr = order.seller?.addresses?.[0]?.address
  const plan = order.paymentPlan
  const isChat = order.orderSource === 'QUOTE_CONVERSION'
  const netSubtotal = money(order.subTotal)
  const discount = money(order.discountAmount)
  const attachPlan = includeInstallments && isChat && plan

  return {
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate || new Date(),
    orderNumber: order.orderNumber,
    orderDate: order.createdAt,
    orderStatus: order.orderStatus,
    paymentMethod: session?.paymentMethod || 'Online Payment',
    currency: CURRENCY,
    showShippingVat: Boolean(showShippingVat),
    seller: {
      companyName: order.seller?.profile?.companyName || order.seller?.name,
      email: order.seller?.email,
      phone: order.seller?.phoneNumber,
      address: formatAddressLine(sellerAddr),
    },
    customer: {
      name:
        typeof customerName === 'function'
          ? customerName(order, session)
          : customerName || defaultBuyerName(order, session),
      email: session?.email || order.customer?.email,
      phone: session?.phone || order.customer?.phoneNumber,
      address: formatAddressLine(ship),
    },
    items: (order.orderLineItems || []).map((li) => ({
      title: li.product?.title || 'Product',
      quantity: li.quantity,
      unitPrice: money(li.unitPriceLocked),
      total: money(Number(li.unitPriceLocked || 0) * Number(li.quantity || 0)),
    })),
    subtotal: money(netSubtotal + discount),
    discount,
    shipping: money(order.shippingFee),
    vat: money(order.vatAmount),
    total:
      typeof total === 'function'
        ? money(total(order, plan))
        : total != null
          ? money(total)
          : resolveInvoiceTotal(order, { showShippingVat, totalMode }),
    ...(attachPlan
      ? {
          paymentPlan: {
            termMonths: plan.termMonths,
            downPayment: money(plan.downPayment),
            remainingBalance: money(plan.remainingBalance),
            totalAmount: money(plan.totalAmount),
          },
          installments: (plan.installments || []).map((i) => ({
            installmentNumber: i.installmentNumber,
            title: ordinalLabel(i.installmentNumber),
            dueDate: i.dueDate,
            status: i.status,
            amount: money(i.amount),
          })),
        }
      : {}),
  }
}

export { CURRENCY }
