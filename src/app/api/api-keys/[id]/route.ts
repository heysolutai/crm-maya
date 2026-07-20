import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { decryptApiKey } from '@/lib/api/api-key-utils'
import { logSecurityEvent } from '@/lib/security-log'

/**
 * Revela a API key REAL da empresa sob demanda.
 *
 * A listagem (/api/api-keys) devolve a chave MASCARADA (••••XXXX) — o valor
 * cheio so aparecia na criacao. Mas o dono precisa recuperar a chave pra usar
 * fora (n8n etc.) sem ter que gerar uma nova. Este endpoint devolve o valor
 * real, com:
 *   - sessao autenticada
 *   - ownership: a key tem que ser da company do usuario (anti-IDOR)
 *   - auditoria (evento de seguranca)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { companyId, agentId: userId } = await authenticate(req)
  if (!companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const { id } = await params

    const record = await prisma.apiKey.findFirst({
      where: { id, companyId },
      select: { key: true, keyHash: true },
    })
    if (!record) {
      return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })
    }

    // Chave criptografada (tem keyHash e formato "iv:ct") -> descriptografa.
    // Senao, e texto puro (fluxo atual gera sk_... em claro).
    let real: string | null = record.key
    if (record.keyHash && record.key.includes(':')) {
      try {
        real = decryptApiKey(record.key)
      } catch {
        real = null
      }
    }

    // Auditoria: alguem acessou o valor cheio de uma API key.
    await logSecurityEvent({ event: 'access_api_keys', userId, companyId, req })

    return NextResponse.json({ key: real })
  } catch (error) {
    return handleApiError(error, 'Erro ao revelar chave')
  }
}
