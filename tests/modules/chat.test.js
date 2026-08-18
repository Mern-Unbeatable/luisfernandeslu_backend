import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CHAT_ROLES,
  normalizeRole,
  isAdmin,
  assertQuoteParticipantRole,
} from '../../src/modules/chat/roles.js'
import { mapThreadSummary } from '../../src/modules/chat/mappers.js'

test('normalizeRole lowercases and treats missing as empty', () => {
  assert.equal(normalizeRole('COMPANY'), 'company')
  assert.equal(normalizeRole(null), '')
})

test('isAdmin only matches admin', () => {
  assert.equal(isAdmin('admin'), true)
  assert.equal(isAdmin('ADMIN'), true)
  assert.equal(isAdmin('supplier'), false)
})

test('CHAT_ROLES covers every live-chat actor', () => {
  assert.deepEqual(CHAT_ROLES, [
    'customer',
    'company',
    'supplier',
    'factory',
    'transporter',
    'admin',
  ])
})

test('assertQuoteParticipantRole allows company and supplier', () => {
  assert.equal(assertQuoteParticipantRole({ id: '1', role: 'COMPANY' }), 'company')
  assert.equal(assertQuoteParticipantRole({ id: '2', role: 'supplier' }), 'supplier')
})

test('assertQuoteParticipantRole rejects customers and missing auth', () => {
  assert.throws(
    () => assertQuoteParticipantRole({ id: '1', role: 'customer' }),
    (err) => err.statusCode === 403 && err.code === 'Forbidden',
  )
  assert.throws(
    () => assertQuoteParticipantRole({}),
    (err) => err.statusCode === 401 && err.code === 'Unauthorized',
  )
})

test('mapThreadSummary lists participant ids', () => {
  const summary = mapThreadSummary({
    id: 't1',
    type: 'QUOTE',
    quoteRequestId: 'q1',
    orderId: null,
    productId: null,
    peerUserId: null,
    participants: [{ userId: 'a' }, { userId: 'b' }],
  })
  assert.equal(summary.id, 't1')
  assert.equal(summary.type, 'QUOTE')
  assert.equal(summary.quoteRequestId, 'q1')
  assert.deepEqual(summary.participantIds, ['a', 'b'])
})
