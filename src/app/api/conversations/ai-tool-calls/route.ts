import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { rotulosDasChamadas } from '@/lib/ai-tools/rotulos'
import { explicarFalhaFerramenta } from '@/lib/erros/ferramentas'

/**
 * GET /api/conversations/ai-tool-calls?conversationId= — as ferramentas que a
 * IA usou na conversa (reserva, consulta, transferencia...), da mais antiga
 * pra mais nova, pra aparecerem no meio do chat. Versao enxuta: sem a
 * resposta do sistema nem o erro tecnico (isso fica em "Logs da IA").
 * Qualquer usuario do restaurante ve (e a conversa que ele ja tem aberta).
 */

/** Cobre conversas longas; o chat so mostra as do trecho de mensagens carregado. */
const LIMITE = 200

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

    const chamadas = await prisma.aiToolCall.findMany({
      where: { conversationId: conversation.id, companyId },
      orderBy: { createdAt: 'desc' },
      take: LIMITE,
      select: {
        id: true,
        toolName: true,
        integrationId: true,
        ok: true,
        error: true,
        httpStatus: true,
        arguments: true,
        createdAt: true,
      },
    })
    const rotulos = await rotulosDasChamadas(chamadas)

    return NextResponse.json({
      data: chamadas.reverse().map((t) => {
        const label = rotulos.label(t)
        return {
          id: t.id,
          toolName: t.toolName,
          label,
          ok: t.ok,
          // Falha em palavras simples (o texto tecnico nao sai daqui).
          explicacao: t.ok
            ? null
            : explicarFalhaFerramenta({ error: t.error, httpStatus: t.httpStatus, sistema: rotulos.sistema(t), ferramenta: label }),
          arguments: t.arguments,
          createdAt: t.createdAt,
        }
      }),
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao carregar ferramentas da IA')
  }
}
