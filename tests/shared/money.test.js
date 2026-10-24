import test from 'node:test'
import assert from 'node:assert/strict'
import {
  money,
  moneyNonNegative,
  moneyText,
  formatMoney,
  currencySymbol,
} from '../../src/shared/money.js'

test('money rounds to two decimals', () => {
  assert.equal(money(10.005), 10.01)
  assert.equal(money(7.129), 7.13)
  assert.equal(money(5), 5)
})

test('money treats nullish and non-numeric input as zero', () => {
  assert.equal(money(null), 0)
  assert.equal(money(undefined), 0)
  assert.equal(money(''), 0)
  assert.equal(money('abc'), 0)
  assert.equal(money(NaN), 0)
})

test('money preserves negative values for refunds and adjustments', () => {
  assert.equal(money(-12.345), -12.35)
})

test('money accepts Prisma decimal-like strings', () => {
  assert.equal(money('1234.567'), 1234.57)
})

test('moneyNonNegative floors at zero for cart and checkout totals', () => {
  assert.equal(moneyNonNegative(-50), 0)
  assert.equal(moneyNonNegative(0), 0)
  assert.equal(moneyNonNegative(19.999), 20)
  assert.equal(moneyNonNegative(undefined), 0)
})

test('moneyText always renders two decimals', () => {
  assert.equal(moneyText(5), '5.00')
  assert.equal(moneyText(0), '0.00')
})

test('formatMoney always renders euro', () => {
  assert.equal(formatMoney(1200), '\u20ac1200.00')
})

test('currencySymbol is the euro sign', () => {
  assert.equal(currencySymbol(), '\u20ac')
})
