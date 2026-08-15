import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis

const pool =
  globalForPrisma.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
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
