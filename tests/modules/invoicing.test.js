import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildInvoicePayload,
  defaultBuyerName,
  resolveInvoiceTotal,
} from '../../src/modules/invoicing/payload.js'

function sampleOrder(overrides = {}) {
  return {
    subTotal: 100,
    discountAmount: 10,
    shippingFee: 20,
    vatAmount: 4,
    grandTotal: 124,
    orderNumber: 'ORD-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    orderStatus: 'PENDING',
    orderSource: 'CART',
    orderLineItems: [
      {
        product: { title: 'Brick' },
        quantity: 2,
        unitPriceLocked: 55,
      },
    ],
    seller: {
      name: 'Seller',
      email: 's@x.test',
      phoneNumber: '1',
      profile: { companyName: 'Acme' },
      addresses: [],
    },
    customer: {
      name: 'Buyer',
      email: 'b@x.test',
      phoneNumber: '2',
      profile: { companyName: 'Co Lda' },
    },
    checkoutSession: {
      firstName: 'Ana',
      lastName: 'Silva',
      email: 'ana@x.test',
      phone: '3',
      paymentMethod: 'Card',
    },
    shippingAddress: null,
    paymentPlan: {
      termMonths: 3,
      downPayment: 40,
      remainingBalance: 84,
      totalAmount: 130,
      installments: [
        {
          installmentNumber: 1,
          amount: 28,
          dueDate: new Date('2026-02-01T00:00:00.000Z'),
          status: 'PENDING',
        },
      ],
    },
    ...overrides,
  }
}

const invoice = { invoiceNumber: 'INV-1', issueDate: new Date('2026-08-01') }

test('resolveInvoiceTotal: net vs grand vs planOrGrand', () => {
  const order = sampleOrder()
  assert.equal(resolveInvoiceTotal(order, { totalMode: 'net' }), 100)
  assert.equal(resolveInvoiceTotal(order, { totalMode: 'grand' }), 124)
  assert.equal(resolveInvoiceTotal(order, { showShippingVat: true }), 124)
  assert.equal(resolveInvoiceTotal(order, { totalMode: 'planOrGrand' }), 130)
  assert.equal(
    resolveInvoiceTotal(sampleOrder({ paymentPlan: null }), {
      totalMode: 'planOrGrand',
    }),
    124,
  )
})

test('supplier copy: gross subtotal, net total, no shipping/VAT, no plan on cart', () => {
  const pdf = buildInvoicePayload(sampleOrder(), invoice, {
    showShippingVat: false,
    includeInstallments: true,
    totalMode: 'net',
  })
  assert.equal(pdf.showShippingVat, false)
  assert.equal(pdf.subtotal, 110)
  assert.equal(pdf.discount, 10)
  assert.equal(pdf.total, 100)
  assert.equal(pdf.paymentPlan, undefined)
  assert.equal(pdf.installments, undefined)
  assert.equal(pdf.customer.name, 'Co Lda')
})

test('buyer copy: same gross subtotal, grand total, shipping/VAT on', () => {
  const pdf = buildInvoicePayload(sampleOrder(), invoice, {
    showShippingVat: true,
    includeInstallments: true,
    totalMode: 'grand',
  })
  assert.equal(pdf.showShippingVat, true)
  assert.equal(pdf.subtotal, 110)
  assert.equal(pdf.total, 124)
  assert.equal(pdf.shipping, 20)
  assert.equal(pdf.vat, 4)
})

test('chat plan attaches only for QUOTE_CONVERSION', () => {
  const cart = buildInvoicePayload(sampleOrder(), invoice, {
    includeInstallments: true,
  })
  assert.equal(cart.paymentPlan, undefined)

  const chat = buildInvoicePayload(
    sampleOrder({ orderSource: 'QUOTE_CONVERSION' }),
    invoice,
    { includeInstallments: true },
  )
  assert.equal(chat.paymentPlan.totalAmount, 130)
  assert.equal(chat.installments.length, 1)
  assert.equal(chat.installments[0].title, '1st Installment')
})

test('order-detail callers can still pass total and customerName functions', () => {
  const pdf = buildInvoicePayload(sampleOrder(), invoice, {
    customerName: (order, session) =>
      order.customer?.name ||
      [session?.firstName, session?.lastName].filter(Boolean).join(' ') ||
      'Customer',
    total: (order) => order.subTotal,
  })
  assert.equal(pdf.customer.name, 'Buyer')
  assert.equal(pdf.total, 100)
})

test('defaultBuyerName prefers company, then personal name, then session', () => {
  assert.equal(
    defaultBuyerName(sampleOrder(), sampleOrder().checkoutSession),
    'Co Lda',
  )
  assert.equal(
    defaultBuyerName(
      sampleOrder({ customer: { name: 'Buyer', profile: {} } }),
      sampleOrder().checkoutSession,
    ),
    'Buyer',
  )
  assert.equal(
    defaultBuyerName(
      sampleOrder({ customer: { profile: {} } }),
      sampleOrder().checkoutSession,
    ),
    'Ana Silva',
  )
})
