import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing — Postgres pool cannot start')
}

/**
 * Remote Postgres is latency-sensitive; keep the pool small and patient.
 * Stale NAT/firewall drops are handled by keepAlive + idle recycle.
 */
const pool =
  globalForPrisma.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_MS || 10_000),
    connectionTimeoutMillis: Number(process.env.DB_POOL_CONN_TIMEOUT_MS || 30_000),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  })

pool.on('error', (err) => {
  console.error('[pg] pool client error:', err.message)
})

const adapter = new PrismaPg(pool)

const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development' && process.env.PRISMA_LOG === 'true'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__pgPool = pool
  globalForPrisma.__prisma = prisma
}

export default prisma
