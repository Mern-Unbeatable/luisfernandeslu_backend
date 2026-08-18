import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkoutNumber,
  orderNumber,
  invoiceNumber,
} from '../../src/shared/numbering.js'

test('checkoutNumber matches CHK-<time>-<random>', () => {
  assert.match(checkoutNumber(), /^CHK-[0-9A-Z]+-[0-9A-Z]{4}$/)
})

test('orderNumber without a suffix has three segments', () => {
  assert.match(orderNumber(), /^ORD-[0-9A-Z]+-[0-9A-Z]{3}$/)
})

test('orderNumber appends the origin suffix', () => {
  assert.match(orderNumber('Q'), /^ORD-[0-9A-Z]+-[0-9A-Z]{3}-Q$/)
  assert.match(orderNumber('F'), /^ORD-[0-9A-Z]+-[0-9A-Z]{3}-F$/)
  assert.match(orderNumber(0), /^ORD-[0-9A-Z]+-[0-9A-Z]{3}-0$/)
})

test('generated numbers are unique across calls', () => {
  const numbers = new Set(Array.from({ length: 40 }, () => orderNumber('Q')))
  assert.equal(numbers.size, 40)
})

test('invoiceNumber keeps the last six alphanumerics of the order number', () => {
  // ORD-ABC123-XYZ -> ORDABC123XYZ -> last six: 123XYZ
  assert.match(invoiceNumber('ORD-ABC123-XYZ'), /^INV-\d{8}-123XYZ$/)
})

test('invoiceNumber appends the audience marker', () => {
  assert.ok(invoiceNumber('ORD-1', { audience: 'CUSTOMER' }).endsWith('-C'))
  assert.ok(invoiceNumber('ORD-1', { audience: 'SUPPLIER' }).endsWith('-S'))
})

test('invoiceNumber honours a custom prefix', () => {
  assert.ok(invoiceNumber('ORD-1', { prefix: 'DOC' }).startsWith('DOC-'))
})

test('invoiceNumber still produces a tail for an empty order number', () => {
  assert.match(invoiceNumber(''), /^INV-\d{8}-[0-9A-Z]+$/)
})
