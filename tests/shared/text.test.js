import test from 'node:test'
import assert from 'node:assert/strict'
import { ordinal, ordinalLabel } from '../../src/shared/ordinal.js'
import { slugify, publicSlug } from '../../src/shared/slug.js'
import { partyName, companyDisplayName, splitName } from '../../src/shared/party.js'
import { formatAddressLine } from '../../src/shared/address.js'

test('ordinal handles the 11-13 exception', () => {
  assert.equal(ordinal(1), '1st')
  assert.equal(ordinal(2), '2nd')
  assert.equal(ordinal(3), '3rd')
  assert.equal(ordinal(4), '4th')
  assert.equal(ordinal(11), '11th')
  assert.equal(ordinal(12), '12th')
  assert.equal(ordinal(13), '13th')
  assert.equal(ordinal(21), '21st')
  assert.equal(ordinal(112), '112th')
})

test('ordinalLabel builds the installment title', () => {
  assert.equal(ordinalLabel(1), '1st Installment')
  assert.equal(ordinalLabel(3), '3rd Installment')
})

test('slugify strips accents and punctuation', () => {
  assert.equal(slugify('Cimento Português 32,5'), 'cimento-portugues-32-5')
  assert.equal(slugify('  Hello   World  '), 'hello-world')
})

test('slugify caps length at 80 characters', () => {
  assert.equal(slugify('a'.repeat(200)).length, 80)
})

test('publicSlug drops the internal uniqueness prefix', () => {
  assert.equal(publicSlug('abc123__cimento'), 'cimento')
  assert.equal(publicSlug('cimento'), 'cimento')
  assert.equal(publicSlug(null), null)
})

test('partyName prefers the company name', () => {
  assert.equal(partyName({ name: 'Ana', profile: { companyName: 'Acme' } }), 'Acme')
  assert.equal(partyName({ name: 'Ana', profile: { companyName: '  ' } }), 'Ana')
  assert.equal(partyName(null), 'User')
  assert.equal(partyName(null, 'Supplier'), 'Supplier')
})

test('companyDisplayName returns null when nothing is set', () => {
  assert.equal(companyDisplayName({}), null)
  assert.equal(companyDisplayName({ name: 'Ana' }), 'Ana')
})

test('splitName repeats a single-word name into both parts', () => {
  assert.deepEqual(splitName('Ana Silva'), { firstName: 'Ana', lastName: 'Silva' })
  assert.deepEqual(splitName('Ana'), { firstName: 'Ana', lastName: 'Ana' })
  assert.deepEqual(splitName('Ana Maria Silva'), {
    firstName: 'Ana',
    lastName: 'Maria Silva',
  })
})

test('splitName falls back when the name is missing', () => {
  assert.deepEqual(splitName('', 'Company'), {
    firstName: 'Company',
    lastName: 'Company',
  })
})

test('formatAddressLine skips empty parts', () => {
  assert.equal(
    formatAddressLine({
      streetAddress: 'Rua A 1',
      city: 'Lisbon',
      state: null,
      zipCode: '1000-001',
      country: 'Portugal',
    }),
    'Rua A 1, Lisbon, 1000-001, Portugal',
  )
  assert.equal(formatAddressLine(null), null)
})
