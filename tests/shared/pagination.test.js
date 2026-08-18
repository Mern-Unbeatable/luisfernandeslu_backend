import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parsePagination,
  paginationMeta,
  searchFilter,
} from '../../src/shared/pagination.js'
import { addMonths, dateStamp, startOfMonth } from '../../src/shared/dates.js'

test('parsePagination applies the caller default limit', () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 10, skip: 0, take: 10 })
  assert.deepEqual(parsePagination({}, { defaultLimit: 12 }), {
    page: 1,
    limit: 12,
    skip: 0,
    take: 12,
  })
})

test('parsePagination computes skip from page', () => {
  assert.deepEqual(parsePagination({ page: 3, limit: 20 }), {
    page: 3,
    limit: 20,
    skip: 40,
    take: 20,
  })
})

test('parsePagination clamps out-of-range input', () => {
  assert.equal(parsePagination({ page: 0 }).page, 1)
  assert.equal(parsePagination({ page: -5 }).page, 1)
  assert.equal(parsePagination({ limit: 999 }).limit, 50)
  assert.equal(parsePagination({ limit: 0 }).limit, 10)
  assert.equal(parsePagination({ page: 'abc' }).page, 1)
})

test('paginationMeta never reports fewer than one page', () => {
  assert.deepEqual(paginationMeta({ page: 1, limit: 10, total: 0 }), {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  })
  assert.equal(paginationMeta({ page: 1, limit: 10, total: 25 }).totalPages, 3)
})

test('searchFilter builds nested case-insensitive contains filters', () => {
  assert.deepEqual(searchFilter('abc', ['orderNumber', 'customer.name']), [
    { orderNumber: { contains: 'abc', mode: 'insensitive' } },
    { customer: { name: { contains: 'abc', mode: 'insensitive' } } },
  ])
})

test('searchFilter handles deeply nested paths', () => {
  assert.deepEqual(searchFilter('x', ['customer.profile.companyName']), [
    {
      customer: {
        profile: { companyName: { contains: 'x', mode: 'insensitive' } },
      },
    },
  ])
})

test('searchFilter returns null for a blank term', () => {
  assert.equal(searchFilter('', ['title']), null)
  assert.equal(searchFilter('   ', ['title']), null)
  assert.equal(searchFilter(undefined, ['title']), null)
})

test('addMonths rolls the month forward', () => {
  assert.equal(addMonths(new Date('2026-01-15T00:00:00Z'), 2).getMonth(), 2)
  assert.equal(addMonths(new Date('2026-11-15T00:00:00Z'), 3).getFullYear(), 2027)
})

test('dateStamp renders YYYYMMDD', () => {
  assert.equal(dateStamp(new Date('2026-08-17T10:00:00Z')), '20260817')
})

test('startOfMonth zeroes the day', () => {
  const start = startOfMonth(new Date('2026-08-17T10:00:00Z'))
  assert.equal(start.getDate(), 1)
  assert.equal(start.getMonth(), 7)
})
