import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

/**
 * Cancela em lote os follow-ups pendentes do restaurante.
 *
 * Existe porque follow-up ligado sem querer gera um job por conversa, e
 * cancelar um a um pela lista nao e opcao quando sao dezenas. Opcionalmente
 * restringe a uma etapa (stageOrder), que e o caso "a etapa 1 esta com texto
 * errado".
 */
const schema = z.object({
  stageOrder: z.number().int().min(1).max(50).optional(),
})

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
  }
  // So usuario logado: chave de API nao cancela nem cria follow-up.
  if (!auth.agentId) {
    return NextResponse.json({ error: 'Apenas usuario logado' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const validation = schema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { count } = await prisma.followUpJob.updateMany({
      where: {
        companyId: auth.companyId,
        status: 'pending',
        ...(validation.data.stageOrder ? { stageOrder: validation.data.stageOrder } : {}),
      },
      data: { status: 'cancelled', errorMessage: 'Cancelado em lote pelo usuario' },
    })

    console.log(`[follow-up-jobs] ${count} pendentes cancelados (company ${auth.companyId})`)
    return NextResponse.json({ success: true, cancelados: count })
  } catch (error) {
    return handleApiError(error, 'Erro ao cancelar follow-ups pendentes')
  }
}
