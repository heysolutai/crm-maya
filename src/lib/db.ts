import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function buildDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const host = process.env.DB_HOST
  const port = process.env.DB_PORT || '5432'
  const user = process.env.DB_USER
  const pass = process.env.DB_PASSWORD
  const name = process.env.DB_NAME
  if (host && user && name) {
    return `postgresql://${user}:${encodeURIComponent(pass || '')}@${host}:${port}/${name}`
  }
  return undefined
}

function createPrismaClient() {
  const connectionString = buildDatabaseUrl()
  const pool = new pg.Pool({
    connectionString,
    max: parseInt(process.env.DB_POOL_MAX || '50'),
    min: parseInt(process.env.DB_POOL_MIN || '5'),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
