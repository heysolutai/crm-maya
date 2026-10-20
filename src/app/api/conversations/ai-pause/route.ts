import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { getAiPauseMinutes, pauseClientAI, resumeClientAI } from '@/lib/ai/pause'

/**
 * Controle manual da pausa da IA a partir da conversa.
 *
 *   POST { conversationId, action: 'pause', minutes? }
 *     minutes omitido  = tempo padrao da empresa (settings.ai_pause_minutes)
 *     minutes null     = sem prazo: so volta quando alguem retomar
 *     minutes 1..1440  = pausa por esse tempo
 *
 *   POST { conversationId, action: 'resume' }
 *     IA volta a responder na hora.
 *
 *   GET  -> { defaultMinutes }: o tempo padrao da empresa, pra tela mostrar
 *           "Pausar pelo tempo padrao (X min)" sem expor o JSON de settings.
 *
 * A pausa e do CLIENTE (vale pra todas as conversas dele); a conversa entra
 * so pra amarrar o tenant, registrar o evento e avisar a tela em tempo real.
 */

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    conversationId: z.string().uuid(),
    action: z.literal('pause'),
    minutes: z.number().int().positive().max(1440).nullable().optional(),
  }),
  z.object({
    conversationId: z.string().uuid(),
    action: z.literal('resume'),
  }),
])

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    const defaultMinutes = await getAiPauseMinutes(companyId)
    return NextResponse.json({ defaultMinutes })
  } catch (error) {
    return handleApiError(error, 'Erro ao buscar tempo padrao de pausa da IA')
  }
}

export async function POST(req: NextRequest) {
  try {
    // authenticate lanca AuthError (401) — o handleApiError devolve o status certo.
    const { companyId, agentId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    const body = await req.json()
    const validation = bodySchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const data = validation.data

    // IDOR: a conversa precisa ser do restaurante autenticado.
    const conversation = await prisma.conversation.findFirst({
      where: { id: data.conversationId, companyId },
      select: { id: true, clientId: true },
    })
    if (!conversation) return NextResponse.json({ error: 'Conversa nao encontrada' }, { status: 404 })
    if (!conversation.clientId) {
      return NextResponse.json({ error: 'Conversa sem contato vinculado' }, { status: 400 })
    }

    // Sessao de usuario = atendente; chamada por API key (n8n) = sistema.
    const actor = agentId ? 'agent' : 'system'

    if (data.action === 'pause') {
      const result = await pauseClientAI({
        companyId,
        clientId: conversation.clientId,
        conversationId: conversation.id,
        actor,
        userId: agentId,
        minutes: data.minutes,
      })
      if (!result.paused) return NextResponse.json({ error: 'Contato nao encontrado' }, { status: 404 })
      return NextResponse.json({ aiPaused: true, aiPausedUntil: result.until })
    }

    const ok = await resumeClientAI({
      companyId,
      clientId: conversation.clientId,
      conversationId: conversation.id,
      actor,
      userId: agentId,
    })
    if (!ok) return NextResponse.json({ error: 'Contato nao encontrado' }, { status: 404 })
    return NextResponse.json({ aiPaused: false, aiPausedUntil: null })
  } catch (error) {
    return handleApiError(error, 'Erro ao alterar pausa da IA')
  }
}
