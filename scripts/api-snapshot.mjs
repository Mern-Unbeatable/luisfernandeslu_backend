/**
 * API contract snapshots.
 *
 * Records the response shape of read-only endpoints against a running server so
 * a refactor can be checked for accidental changes:
 *
 *   npm run api:snapshot   # before refactoring - writes the baseline
 *   npm run api:diff       # after refactoring  - reports any shape change
 *
 * Values that legitimately change between runs (ids, timestamps, generated
 * numbers) are masked, so the diff only reports structural or semantic drift.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const BASE_URL = (process.env.SNAPSHOT_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '')
const PASSWORD = process.env.SNAPSHOT_PASSWORD || 'Password123!'
const SNAPSHOT_DIR = path.resolve(process.cwd(), 'tests/__snapshots__/api')

const ACCOUNTS = {
  customer: process.env.SNAPSHOT_CUSTOMER_EMAIL || 'customer@test.local',
  company: process.env.SNAPSHOT_COMPANY_EMAIL || 'company@test.local',
  supplier: process.env.SNAPSHOT_SUPPLIER_EMAIL || 'supplier@test.local',
  factory: process.env.SNAPSHOT_FACTORY_EMAIL || 'factory@test.local',
}

/** role `null` means the endpoint is public. */
const ENDPOINTS = [
  { role: null, path: '/health' },
  { role: null, path: '/api/categories' },
  { role: null, path: '/api/marketplace/products?page=1&limit=5' },

  { role: 'customer', path: '/api/cart' },
  { role: 'customer', path: '/api/addresses' },

  { role: 'company', path: '/api/cart' },
  { role: 'company', path: '/api/quotes?page=1&limit=5' },

  { role: 'supplier', path: '/api/products?page=1&limit=5' },
  { role: 'supplier', path: '/api/inventory?page=1&limit=5' },
  { role: 'supplier', path: '/api/promo-codes?page=1&limit=5' },
  { role: 'supplier', path: '/api/quotes?page=1&limit=5' },
  { role: 'supplier', path: '/api/supplier/customer-orders/stats' },
  { role: 'supplier', path: '/api/supplier/customer-orders?page=1&limit=5' },
  { role: 'supplier', path: '/api/supplier/company-orders/stats?type=direct' },
  { role: 'supplier', path: '/api/supplier/company-orders/stats?type=chat' },
  { role: 'supplier', path: '/api/supplier/company-orders/companies' },
  { role: 'supplier', path: '/api/supplier/company-orders/direct?page=1&limit=5' },
  { role: 'supplier', path: '/api/supplier/company-orders/chat?page=1&limit=5' },
  { role: 'supplier', path: '/api/supplier/documents/stats' },
  { role: 'supplier', path: '/api/supplier/documents?page=1&limit=5' },
  { role: 'supplier', path: '/api/supplier/documents/eligible-orders' },
  { role: 'supplier', path: '/api/supplier/factory-products?page=1&limit=5' },

  { role: 'factory', path: '/api/factory/products?page=1&limit=5' },
  { role: 'factory', path: '/api/factory-offers/orders?page=1&limit=5' },
]

const MASKS = [
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>'],
  [/\b[a-z0-9]{24,32}\b/gi, '<id>'],
  [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<date>'],
  [/\bORD-[0-9A-Z-]+/g, '<orderNumber>'],
  [/\bCHK-[0-9A-Z-]+/g, '<checkoutNumber>'],
  [/\b(INV|DOC)-[0-9A-Z-]+/g, '<invoiceNumber>'],
]

function maskString(value) {
  return MASKS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), value)
}

/**
 * Keeps structure and value types but masks volatile data. Arrays are reduced
 * to their first element plus a length marker, so a list of 50 orders does not
 * produce a 50-entry diff when one field changes.
 */
function normalize(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return maskString(value)
  if (typeof value === 'number') return Number.isInteger(value) ? '<int>' : '<float>'
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    // Length is intentionally ignored: rows change as the database is used.
    return value.length ? ['<array>', normalize(value[0])] : ['<empty>']
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalize(value[key])]),
  )
}

async function login(role) {
  const res = await fetch(`${BASE_URL}/api/auth/login/${role}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ACCOUNTS[role], password: PASSWORD }),
  })
  const body = await res.json().catch(() => ({}))
  const token = body?.accessToken || body?.token || body?.data?.accessToken
  if (!res.ok || !token) {
    throw new Error(`login ${role} failed (${res.status}): ${body?.message || 'no token'}`)
  }
  return token
}

async function capture() {
  const tokens = {}
  for (const role of Object.keys(ACCOUNTS)) {
    try {
      tokens[role] = await login(role)
    } catch (err) {
      console.warn(`  skip ${role}: ${err.message}`)
    }
  }

  const snapshot = {}
  for (const { role, path: endpoint } of ENDPOINTS) {
    if (role && !tokens[role]) continue
    const key = `${role || 'public'} ${endpoint}`
    try {
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        headers: role ? { Authorization: `Bearer ${tokens[role]}` } : {},
      })
      const body = await res.json().catch(() => ({ _nonJson: true }))
      snapshot[key] = { status: res.status, body: normalize(body) }
    } catch (err) {
      snapshot[key] = { status: 'ERROR', error: err.message }
    }
  }
  return snapshot
}

function flatten(value, prefix = '', out = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out)
    }
  } else {
    out[prefix] = JSON.stringify(value)
  }
  return out
}

function diff(before, after) {
  const a = flatten(before)
  const b = flatten(after)
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
  const changes = []
  for (const key of keys) {
    if (!(key in a)) changes.push({ key, type: 'added', after: b[key] })
    else if (!(key in b)) changes.push({ key, type: 'removed', before: a[key] })
    else if (a[key] !== b[key]) changes.push({ key, type: 'changed', before: a[key], after: b[key] })
  }
  return changes
}

const snapshotFile = path.join(SNAPSHOT_DIR, 'baseline.json')

async function main() {
  const mode = process.argv[2] || 'capture'
  console.log(`Target: ${BASE_URL}`)

  const current = await capture()
  const captured = Object.keys(current).length
  console.log(`Captured ${captured} endpoint responses.`)

  if (mode === 'capture') {
    await fs.mkdir(SNAPSHOT_DIR, { recursive: true })
    await fs.writeFile(snapshotFile, `${JSON.stringify(current, null, 2)}\n`)
    console.log(`Baseline written to ${path.relative(process.cwd(), snapshotFile)}`)
    return
  }

  const raw = await fs.readFile(snapshotFile, 'utf8').catch(() => null)
  if (!raw) {
    console.error('No baseline found. Run "npm run api:snapshot" first.')
    process.exitCode = 1
    return
  }

  const changes = diff(JSON.parse(raw), current)
  if (!changes.length) {
    console.log('No contract changes detected.')
    return
  }

  console.log(`\n${changes.length} change(s):\n`)
  for (const change of changes) {
    if (change.type === 'changed') {
      console.log(`  ~ ${change.key}\n      before: ${change.before}\n      after:  ${change.after}`)
    } else if (change.type === 'added') {
      console.log(`  + ${change.key} = ${change.after}`)
    } else {
      console.log(`  - ${change.key} (was ${change.before})`)
    }
  }
  process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
