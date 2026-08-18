import test from 'node:test'
import assert from 'node:assert/strict'
import { mapOfferCard, mapMessage } from '../../src/modules/offers/mappers.js'

const offer = {
  id: 'o1',
  status: 'PENDING_RESPONSE',
  warehouseLocation: 'Lisbon',
  productName: 'Cement',
  productId: 'p1',
  totalQuantity: 100,
  quantityUnit: 'bags',
  projectName: 'Site A',
  deliveryLocation: 'Porto',
  unloadingType: 'forklift',
  accessConditions: 'wide gate',
  totalPrice: 1000,
  installmentMonths: 2,
  createdAt: new Date('2026-01-01T10:00:00Z'),
  updatedAt: new Date('2026-01-01T10:00:00Z'),
  installments: [
    { installmentNumber: 1, amount: 400, quantity: 40 },
    { installmentNumber: 2, amount: 600, quantity: 60 },
  ],
}

test('mapOfferCard builds installment pricing and remaining balance', () => {
  const card = mapOfferCard(offer)
  assert.equal(card.title, 'Offer Card')
  assert.equal(card.statusLabel, 'Pending Response')
  assert.equal(card.totalPrice, 1000)
  assert.equal(card.installments.length, 2)
  assert.equal(card.installments[0].label, '1st Installment')
  assert.equal(card.summary.firstInstallment, card.installments[0].amountLabel)
  assert.match(card.summary.remainingBalance, /600\.00/)
  assert.equal(card.product, 'Cement')
  assert.equal(card.address, 'Porto')
})

test('mapOfferCard uses bags as the default unit', () => {
  const card = mapOfferCard({ ...offer, quantityUnit: null, installments: [] })
  assert.equal(card.quantityUnit, 'bags')
  assert.equal(card.quantity, '100 bags')
})

test('mapMessage marks sender relative to the viewer', () => {
  const msg = {
    id: 'm1',
    senderId: 'u1',
    messageType: 'TEXT',
    messageText: 'hello',
    attachmentUrl: null,
    createdAt: new Date('2026-01-01T10:00:00Z'),
    sender: { name: 'Ada', image: null, profile: { companyName: null } },
    offer: null,
  }
  const mine = mapMessage(msg, 'u1', 'http://localhost')
  assert.equal(mine.sender, 'me')
  assert.equal(mine.type, 'text')
  const theirs = mapMessage(msg, 'u2', 'http://localhost')
  assert.equal(theirs.sender, 'them')
  const unknown = mapMessage(msg, null, 'http://localhost')
  assert.equal(unknown.sender, undefined)
})
