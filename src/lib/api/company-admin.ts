import { prisma } from '@/lib/db'
import type { AuthResult } from './types'

/**
 * Admin do restaurante (ou super-admin personificando). Acoes que mexem na
 * conexao do WhatsApp ficam restritas a esse papel, igual ao menu "Conexoes".
 * Chamada por API key (n8n) nao tem usuario: nao passa.
 */
export async function isCompanyAdmin(auth: AuthResult): Promise<boolean> {
  if (auth.isSuperAdmin) return true
  if (!auth.agentId || !auth.companyId) return false
  const role = await prisma.userRole.findFirst({
    where: { userId: auth.agentId, companyId: auth.companyId, role: 'company_admin' },
    select: { id: true },
  })
  return Boolean(role)
}
