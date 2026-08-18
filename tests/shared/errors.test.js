import test from 'node:test'
import assert from 'node:assert/strict'
import { mapDatabaseError } from '../../src/shared/errors.js'

test('mapDatabaseError turns Prisma ECONNREFUSED into 503', () => {
  const mapped = mapDatabaseError({
    name: 'PrismaClientKnownRequestError',
    message: 'Invalid `prisma.user.findUnique()` invocation:',
    code: 'ECONNREFUSED',
    meta: { modelName: 'User' },
  })
  assert.equal(mapped.statusCode, 503)
  assert.equal(mapped.code, 'DatabaseUnavailable')
})

test('mapDatabaseError ignores normal Prisma unique conflicts', () => {
  assert.equal(mapDatabaseError({ code: 'P2002' }), null)
  assert.equal(mapDatabaseError({ code: 'P2025' }), null)
  assert.equal(mapDatabaseError(null), null)
})
