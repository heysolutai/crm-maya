import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { explicarTurno } from '@/lib/ai/motivos'

/**
 * GET /api/conversations/ai-turns?conversationId= — os ultimos 20 turnos da
 * IA numa conversa, com o motivo explicado ("Decisões da IA" no painel).
 * Qualquer usuario do restaurante ve (e a conversa que ele ja tem aberta).
 */

const querySchema = z.object({ conversationId: z.string().uuid() })

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    const parsed = querySchema.safeParse({ conversationId: req.nextUrl.searchParams.get('conversationId') })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    // IDOR: a conversa precisa ser do restaurante.
    const conversation = await prisma.conversation.findFirst({
      where: { id: parsed.data.conversationId, companyId },
      select: { id: true },
    })
    if (!conversation) return NextResponse.json({ error: 'Conversa nao encontrada' }, { status: 404 })

    const turnos = await prisma.aiTurn.findMany({
      where: { conversationId: conversation.id, companyId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return NextResponse.json({
      data: turnos.map((t) => ({
        id: t.id,
        createdAt: t.createdAt,
        status: t.status,
        motivo: t.motivo,
        texto: t.texto,
        resposta: t.resposta,
        respondidoEm: t.respondidoEm,
        latencyMs: t.latencyMs,
        bloqueios: t.bloqueios,
        pausadoAte: t.pausadoAte,
        mensagens: t.messageIds.length,
        explicacao: explicarTurno(t),
      })),
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao carregar decisões da IA')
  }
}
