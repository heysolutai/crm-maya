import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { AuthError } from './errors'
import type { AuthResult } from './types'

/**
 * Validates internal service-to-service calls using INTERNAL_API_SECRET.
 */
export function isInternalRequest(req: Request): boolean {
  const internalKey = req.headers.get('x-internal-key')
  const secret = process.env.INTERNAL_API_SECRET
  return !!secret && !!internalKey && internalKey === secret
}

/**
 * Authenticate a request via NextAuth session or x-api-key header.
 * Super admins can impersonate a company via ?companyId= query param.
 */
export async function authenticate(req: Request): Promise<AuthResult> {
  // Try NextAuth session first
  const session = await auth()

  if (session?.user) {
    let companyId = session.user.companyId ?? null
    const isSuperAdmin = session.user.isSuperAdmin ?? false

    // Super admin impersonation: accept companyId from query string
    // ONLY super admins can override — regular users always use their session companyId
    if (isSuperAdmin) {
      try {
        const url = new URL(req.url)
        const qsCompanyId = url.searchParams.get('companyId')
        if (qsCompanyId) companyId = qsCompanyId
      } catch {
        // ignore URL parse errors
      }
    }

    return {
      agentId: session.user.id,
      companyId,
      isSuperAdmin,
    }
  }

  // Fallback to API key auth
  const apiKey = req.headers.get('x-api-key')
  if (apiKey) {
    const keyData = await prisma.apiKey.findFirst({
      where: { key: apiKey, isActive: true },
      select: { id: true, companyId: true },
    })

    if (!keyData) {
      throw new AuthError('API key invalida ou inativa', 401, 'INVALID_API_KEY')
    }

    await prisma.apiKey.update({
      where: { id: keyData.id },
      data: { lastUsedAt: new Date() },
    })

    return {
      agentId: null,
      companyId: keyData.companyId,
      isSuperAdmin: false,
    }
  }

  throw new AuthError(
    'Autenticacao obrigatoria: envie a sessao ou o header x-api-key',
    401,
    'AUTH_REQUIRED',
  )
}
