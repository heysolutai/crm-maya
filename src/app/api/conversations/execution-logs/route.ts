import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { rotulosDasChamadas } from '@/lib/ai-tools/rotulos'
import { explicarFalhaFerramenta } from '@/lib/erros/ferramentas'

/**
 * GET ?conversationId= -> execucoes do fluxo de IA (n8n / Maestro) da conversa,
 * mais recentes primeiro, com a previa da mensagem do cliente que disparou.
 * Alimenta a aba "Logs da IA" do painel da conversa.
 *
 * Tambem devolve `toolCalls`: as ultimas chamadas de ferramenta da IA
 * (AiToolCall) na conversa, com o nome amigavel de cada ferramenta.
 */

const TOOL_CALLS_LIMIT = 50
const TEXTO_MAX = 600

function cortar(texto: string | null): string | null {
  if (!texto) return texto
  return texto.length > TEXTO_MAX ? `${texto.slice(0, TEXTO_MAX)}…` : texto
}

const querySchema = z.object({
  conversationId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req)
    const { companyId } = auth
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    const parsed = querySchema.safeParse({
      conversationId: req.nextUrl.searchParams.get('conversationId'),
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // IDOR: a conversa precisa ser do restaurante autenticado.
    const conversation = await prisma.conversation.findFirst({
      where: { id: parsed.data.conversationId, companyId },
      select: { id: true, aiThreadId: true },
    })
    if (!conversation) return NextResponse.json({ error: 'Conversa nao encontrada' }, { status: 404 })

    const [logs, toolCalls] = await Promise.all([
      prisma.executionLog.findMany({
        where: { conversationId: conversation.id, companyId },
        orderBy: { createdAt: 'desc' },
        take: parsed.data.limit ?? 50,
      }),
      prisma.aiToolCall.findMany({
        where: { conversationId: conversation.id, companyId },
        orderBy: { createdAt: 'desc' },
        take: TOOL_CALLS_LIMIT,
        select: {
          id: true,
          toolName: true,
          integrationId: true,
          source: true,
          ok: true,
          result: true,
          error: true,
          arguments: true,
          durationMs: true,
          httpStatus: true,
          runId: true,
          createdAt: true,
        },
      }),
    ])

    const rotulos = await rotulosDasChamadas(toolCalls)
    const superAdmin = auth.isSuperAdmin === true

    const messageIds = logs.map((l) => l.messageId).filter((id): id is string => !!id)
    const messages = messageIds.length
      ? await prisma.message.findMany({
          where: { id: { in: messageIds }, conversationId: conversation.id },
          select: { id: true, messageText: true, messageType: true, createdAt: true },
        })
      : []
    const byId = new Map(messages.map((m) => [m.id, m]))

    return NextResponse.json({
      threadId: conversation.aiThreadId,
      toolCalls: toolCalls.map((t) => {
        const label = rotulos.label(t)
        const sistema = rotulos.sistema(t)
        return {
          id: t.id,
          toolName: t.toolName,
          label,
          sistema,
          source: t.source,
          ok: t.ok,
          // Falha em palavras simples pra qualquer pessoa do restaurante.
          explicacao: t.ok
            ? null
            : explicarFalhaFerramenta({ error: t.error, httpStatus: t.httpStatus, sistema, ferramenta: label }),
          result: cortar(t.result),
          // Texto tecnico e status HTTP: so o super-admin.
          error: superAdmin ? cortar(t.error) : null,
          httpStatus: superAdmin ? t.httpStatus : null,
          arguments: t.arguments,
          durationMs: t.durationMs,
          runId: t.runId,
          createdAt: t.createdAt,
        }
      }),
      data: logs.map((l) => {
        const msg = l.messageId ? byId.get(l.messageId) : undefined
        return {
          id: l.id,
          provider: l.provider,
          threadId: l.threadId,
          runId: l.runId,
          executionUrl: l.executionUrl,
          status: l.status,
          errorMessage: l.errorMessage,
          createdAt: l.createdAt,
          updatedAt: l.updatedAt,
          message: msg
            ? {
                id: msg.id,
                text: (msg.messageText || '').slice(0, 160),
                type: msg.messageType,
                createdAt: msg.createdAt,
              }
            : null,
        }
      }),
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao buscar logs de execucao')
  }
}
