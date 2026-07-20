import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

/**
 * Revela o token REAL da instancia (instance_api_key) sob demanda.
 *
 * A listagem (/api/agents) devolve o token MASCARADO (••••XXXX) pra nao vazar
 * segredo em massa. Mas o dono precisa conseguir copiar o token pra usar fora
 * (n8n etc.). Entao este endpoint devolve o valor cru, mediante:
 *   - sessao autenticada (nao aceita so isso via lista publica)
 *   - ownership: a inbox tem que ser da company do usuario (anti-IDOR)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { companyId } = await authenticate(req)
  if (!companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const { id } = await params

    const inbox = await prisma.inbox.findFirst({
      where: { id, companyId },
      select: { instanceApiKey: true },
    })
    if (!inbox) {
      return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })
    }

    return NextResponse.json({ instance_api_key: inbox.instanceApiKey ?? null })
  } catch (error) {
    return handleApiError(error, 'Erro ao revelar chave')
  }
}
