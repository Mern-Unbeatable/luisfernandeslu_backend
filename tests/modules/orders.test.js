import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeStatusFilter,
  normalizeActionStatus,
  buildOrderActions,
} from '../../src/modules/orders/status-rules.js'
import { pickCurrentInstallment } from '../../src/modules/orders/installments.js'
import {
  factoryStatusLabel,
  normalizeFactoryStatusFilter,
  normalizeFactoryActionStatus,
  canSupplierDeleteFactoryOrder,
  buildFactoryOrderActions,
} from '../../src/modules/orders/factory-status-rules.js'
import { mapFactoryOrderDetail } from '../../src/modules/orders/factory-order.mapper.js'

test('normalizeStatusFilter maps UI aliases', () => {
  assert.equal(normalizeStatusFilter('all'), null)
  assert.equal(normalizeStatusFilter('new'), 'NEW')
  assert.deepEqual(normalizeStatusFilter('assigned'), {
    in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'],
  })
  assert.deepEqual(normalizeStatusFilter('completed'), {
    in: ['COMPLETED', 'DELIVERED'],
  })
  assert.equal(normalizeStatusFilter('cancel'), 'CANCELLED')
})

test('normalizeActionStatus accepts accept as PENDING', () => {
  assert.equal(normalizeActionStatus('accept'), 'PENDING')
  assert.equal(normalizeActionStatus('PROCESSING'), 'PROCESSING')
  assert.equal(normalizeActionStatus('cancel'), 'CANCELLED')
  assert.equal(normalizeActionStatus('nope'), null)
})

test('buildOrderActions for a NEW order', () => {
  const actions = buildOrderActions({ orderStatus: 'NEW', invoices: [] }, null)
  assert.equal(actions.canAccept, true)
  assert.equal(actions.canMarkProcessing, false)
  assert.equal(actions.canCancel, true)
  assert.equal(actions.canDownloadInvoice, false)
})

test('buildOrderActions for a PENDING order', () => {
  const actions = buildOrderActions(
    { orderStatus: 'PENDING', invoices: [{ id: 'inv' }] },
    null,
  )
  assert.equal(actions.canAccept, false)
  assert.equal(actions.canMarkProcessing, true)
  assert.equal(actions.hasInvoice, true)
  assert.equal(actions.canDownloadInvoice, true)
})

test('pickCurrentInstallment prefers pending then last paid', () => {
  const rows = [
    { installmentNumber: 1, status: 'COMPLETED' },
    { installmentNumber: 2, status: 'PENDING' },
    { installmentNumber: 3, status: 'PENDING' },
  ]
  assert.equal(pickCurrentInstallment(rows).installmentNumber, 2)
  assert.equal(
    pickCurrentInstallment([{ installmentNumber: 1, status: 'COMPLETED' }])
      .installmentNumber,
    1,
  )
  assert.equal(pickCurrentInstallment([]), null)
})

test('factory status filter maps UI labels', () => {
  assert.equal(normalizeFactoryStatusFilter('all'), null)
  assert.equal(normalizeFactoryStatusFilter('new'), 'NEW')
  assert.equal(normalizeFactoryStatusFilter('In Production'), 'IN_PRODUCTION')
  assert.equal(normalizeFactoryStatusFilter('produced'), 'PRODUCED')
  assert.equal(normalizeFactoryStatusFilter('ready'), 'READY')
  assert.equal(normalizeFactoryStatusFilter('cancel'), 'CANCELLED')
  assert.deepEqual(normalizeFactoryStatusFilter('assigned'), {
    in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'],
  })
  assert.equal(factoryStatusLabel('IN_PRODUCTION'), 'In Production')
  assert.equal(factoryStatusLabel('CANCELLED'), 'Cancel')
})

test('factory status actions follow NEW → In Production → Produced → Ready', () => {
  assert.equal(normalizeFactoryActionStatus('in production'), 'IN_PRODUCTION')
  assert.equal(normalizeFactoryActionStatus('produced'), 'PRODUCED')
  assert.equal(normalizeFactoryActionStatus('ready'), 'READY')
  assert.equal(normalizeFactoryActionStatus('accept'), null)

  const fresh = buildFactoryOrderActions({ orderStatus: 'NEW' }, 'factory')
  assert.equal(fresh.canMarkInProduction, true)
  assert.equal(fresh.nextStatus, 'IN_PRODUCTION')

  const producing = buildFactoryOrderActions(
    { orderStatus: 'IN_PRODUCTION' },
    'factory',
  )
  assert.equal(producing.canMarkProduced, true)
  assert.equal(producing.canMarkInProduction, false)

  const supplierNew = buildFactoryOrderActions({ orderStatus: 'NEW' }, 'supplier')
  assert.equal(supplierNew.canDelete, true)
  assert.equal(supplierNew.canMarkReady, false)
  assert.equal(canSupplierDeleteFactoryOrder('ASSIGNED'), false)
  assert.equal(canSupplierDeleteFactoryOrder('READY'), true)
})

test('factory order details only expose the UI fields', () => {
  const detail = mapFactoryOrderDetail(
    {
      id: 'ord-1',
      orderNumber: 'ORD-001',
      createdAt: new Date('2024-03-12'),
      orderStatus: 'IN_PRODUCTION',
      grandTotal: 2500,
      subTotal: 2500,
      vatAmount: 0,
      shippingFee: 0,
      customer: {
        name: 'Supplier Materials Lda',
        email: 'supplier@test.local',
        phoneNumber: '+351910000001',
        profile: { companyName: 'Supplier Materials Lda' },
      },
      shippingAddress: {
        streetAddress: '123 Main St',
        state: 'Lisboa',
        zipCode: '1000-001',
        country: 'Portugal',
      },
      checkoutSession: null,
      orderLineItems: [
        {
          id: 'line-1',
          quantity: 100,
          unitPriceLocked: 25,
          totalPriceLocked: 2500,
          product: { title: 'Portland Cement', unitOfMeasure: 'Bags' },
        },
      ],
      paymentPlan: {
        totalAmount: 2500,
        remainingBalance: 1500,
        installments: [
          {
            id: 'i1',
            installmentNumber: 1,
            amount: 1000,
            status: 'COMPLETED',
            paidAt: new Date('2024-03-12'),
            dueDate: new Date('2024-03-12'),
            fulfillmentBridge: [],
          },
          {
            id: 'i2',
            installmentNumber: 2,
            amount: 1500,
            status: 'PENDING',
            paidAt: null,
            dueDate: new Date('2024-04-12'),
            fulfillmentBridge: [],
          },
        ],
      },
    },
    'supplier',
  )

  assert.deepEqual(Object.keys(detail).sort(), [
    'id',
    'installmentBreakdown',
    'installments',
    'orderDate',
    'orderNumber',
    'orderStatus',
    'payment',
    'products',
    'status',
    'supplier',
  ])
  assert.equal(detail.supplier.name, 'Supplier Materials Lda')
  assert.equal(detail.payment.paymentStatus, 'PENDING')
  assert.equal(detail.payment.remainingAmount, 1500)
  assert.equal(detail.products[0].shipping, 'Included')
  assert.equal(detail.installments[0].status, 'Paid')
  assert.equal(detail.installments[0].actions.canView, true)
  assert.equal(detail.installments[1].actions.canPay, true)
  assert.equal(detail.factory, undefined)
  assert.equal(detail.logistics, undefined)
  assert.equal(detail.statusHistory, undefined)
})

