import { env } from '../../config/env.js'
import { money } from '../../shared/money.js'
import { categoryLabels } from '../../shared/catalog.js'
import { formatAddressLine } from '../../shared/address.js'

export const CURRENCY = env.currency

export function weightSizeText(product) {
  const parts = []
  if (product?.weightKg) parts.push(`${product.weightKg} kg`)
  if (product?.unitOfMeasure) parts.push(product.unitOfMeasure)
  if (product?.specifications) {
    const spec = String(product.specifications).slice(0, 80)
    if (spec) parts.push(spec)
  }
  return parts.join(', ') || null
}

export const productInclude = {
  select: {
    id: true,
    title: true,
    sku: true,
    weightKg: true,
    unitOfMeasure: true,
    specifications: true,
    warehouseLocation: true,
    category: {
      select: {
        id: true,
        name: true,
        parentCategory: {
          select: {
            id: true,
            name: true,
            parentCategory: { select: { id: true, name: true } },
          },
        },
      },
    },
  },
}

export function mapProducts(orderLineItems) {
  return (orderLineItems || []).map((li) => {
    const labels = categoryLabels(li.product?.category)
    return {
      id: li.id,
      productId: li.productId,
      title: li.product?.title || null,
      category: labels.category,
      material: labels.material,
      weightSize: weightSizeText(li.product),
      quantity: li.quantity,
      unit: li.product?.unitOfMeasure || null,
      unitPrice: money(li.unitPriceLocked),
      warehouseLocation:
        li.warehouseLocation || li.product?.warehouseLocation || null,
      total: money(li.totalPriceLocked),
    }
  })
}

export function mapInvoiceSummary(invoice) {
  if (!invoice) return null
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    pdfUrl: invoice.pdfUrl,
    issueDate: invoice.issueDate,
    audience: invoice.audience || null,
  }
}

export function mapBuyerContact(order, displayName) {
  const ship = order.shippingAddress
  const session = order.checkoutSession
  return {
    id: order.customer?.id || null,
    name:
      displayName ||
      order.customer?.name ||
      [session?.firstName, session?.lastName].filter(Boolean).join(' ') ||
      null,
    email: session?.email || order.customer?.email || null,
    phone: session?.phone || order.customer?.phoneNumber || null,
    region: ship?.state || null,
    city: ship?.city || null,
    zipCode: ship?.zipCode || null,
    address: ship?.streetAddress || formatAddressLine(ship),
    country: ship?.country || null,
  }
}

export function lineSubtotal(products) {
  return money(products.reduce((s, p) => s + Number(p.total || 0), 0))
}
