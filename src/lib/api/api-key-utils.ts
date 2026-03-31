import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/db'

const KEY_PREFIX_LENGTH = 12
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/**
 * Get the 32-byte encryption key from env.
 * Falls back to a derived key from NEXTAUTH_SECRET if API_KEY_ENCRYPTION_SECRET is not set.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('Missing API_KEY_ENCRYPTION_SECRET or NEXTAUTH_SECRET')
  // Derive a 32-byte key via SHA-256
  return createHash('sha256').update(secret).digest()
}

/** Encrypt a raw API key → "iv:encrypted:authTag" (hex-encoded) */
export function encryptApiKey(rawKey: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(rawKey, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`
}

/** Decrypt an encrypted key back to plain text */
export function decryptApiKey(encryptedKey: string): string {
  const key = getEncryptionKey()
  const [ivHex, dataHex, tagHex] = encryptedKey.split(':')
  if (!ivHex || !dataHex || !tagHex) throw new Error('Invalid encrypted key format')
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()])
  return decrypted.toString('utf8')
}

/** Extract the prefix used for fast DB lookup */
export function extractPrefix(rawKey: string): string {
  return rawKey.substring(0, KEY_PREFIX_LENGTH)
}

/** SHA-256 hash for fast constant-time comparison */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex')
}

/** Constant-time comparison of two hex hash strings */
function safeCompareHashes(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

/**
 * Verify an API key from a request header.
 * Uses prefix for DB lookup + SHA-256 hash comparison (constant-time).
 * Falls back to plain-text match for keys not yet migrated.
 */
export async function verifyApiKey(rawKey: string): Promise<{
  id: string
  companyId: string
  isActive: boolean
  expiresAt: Date | null
} | null> {
  const prefix = extractPrefix(rawKey)
  const hash = hashApiKey(rawKey)

  // Try hashed lookup first (new/migrated keys)
  const hashedMatch = await prisma.apiKey.findFirst({
    where: { keyPrefix: prefix },
    select: { id: true, companyId: true, isActive: true, expiresAt: true, keyHash: true },
  })

  if (hashedMatch?.keyHash && safeCompareHashes(hash, hashedMatch.keyHash)) {
    return {
      id: hashedMatch.id,
      companyId: hashedMatch.companyId,
      isActive: hashedMatch.isActive,
      expiresAt: hashedMatch.expiresAt,
    }
  }

  // Fallback: plain-text lookup for unmigrated keys
  const plainMatch = await prisma.apiKey.findFirst({
    where: { key: rawKey, keyHash: null },
    select: { id: true, companyId: true, isActive: true, expiresAt: true },
  })

  if (plainMatch) {
    // Auto-migrate: encrypt + hash the key
    await prisma.apiKey.update({
      where: { id: plainMatch.id },
      data: {
        keyHash: hash,
        keyPrefix: prefix,
        key: encryptApiKey(rawKey),
      },
    }).catch(() => {})

    return {
      id: plainMatch.id,
      companyId: plainMatch.companyId,
      isActive: plainMatch.isActive,
      expiresAt: plainMatch.expiresAt,
    }
  }

  return null
}

/**
 * Full authentication flow for API key from request header.
 * Validates key, checks active/expiry, updates lastUsedAt.
 */
export async function authenticateApiKeyFromHeader(
  req: Request
): Promise<{ companyId: string; keyId: string } | null> {
  const rawKey = req.headers.get('x-api-key')
  if (!rawKey) return null

  const keyData = await verifyApiKey(rawKey)
  if (!keyData) return null
  if (!keyData.isActive) return null
  if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) return null

  // Update last used (fire-and-forget)
  prisma.apiKey.update({
    where: { id: keyData.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {})

  return { companyId: keyData.companyId, keyId: keyData.id }
}

/**
 * Retrieve the decrypted API key for a company.
 * Use this when you need the raw key value (e.g., for webhook payloads).
 */
export async function getDecryptedApiKey(companyId: string): Promise<string | null> {
  const record = await prisma.apiKey.findFirst({
    where: { companyId, isActive: true },
    select: { key: true, keyHash: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!record) return null

  // If key is encrypted (has keyHash set), decrypt it
  if (record.keyHash && record.key.includes(':')) {
    try {
      return decryptApiKey(record.key)
    } catch {
      return null
    }
  }

  // Unmigrated plain-text key
  return record.key
}
