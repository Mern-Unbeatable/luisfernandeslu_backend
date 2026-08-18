import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeStatusFilter,
  normalizeActionStatus,
  buildOrderActions,
} from '../../src/modules/orders/status-rules.js'
import { pickCurrentInstallment } from '../../src/modules/orders/installments.js'

test('normalizeStatusFilter maps UI aliases', () => {
  assert.equal(normalizeStatusFilter('all'), null)
  assert.equal(normalizeStatusFilter('new'), 'NEW')
  assert.deepEqual(normalizeStatusFilter('assigned'), {
    in: ['ASSIGNED', 'IN_TRANSIT'],
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
