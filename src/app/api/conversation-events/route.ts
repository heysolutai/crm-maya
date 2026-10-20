import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleCors, jsonResponse } from '@/lib/api/cors'
import { handleApiErrorCors } from '@/lib/api/errors'
import type { AuthResult } from '@/lib/api/types'

/**
 * Linha do tempo de eventos da conversa (tabela conversation_events).
 *
 * POST: o n8n registra um encaminhamento SEM transferir a conversa (ex: a IA
 * mandou o contato da equipe de eventos pro cliente). Conta no dashboard em
 * "Encaminhadas p/ eventos" / "Encaminhadas p/ humano".
 * GET: lista os eventos de uma conversa (timeline).
 *
 * Aceita sessao ou x-api-key. Sem sessao = chamada do n8n = actor 'ai'.
 */

const createSchema = z.object({
  conversation_id: z.string().uuid(),
  type: z.enum(['handoff_event', 'handoff_human']),
  note: z.string().trim().max(500).optional(),
})

const listSchema = z.object({
  conversationId: z.string().uuid(),
})

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null)
}

/**
 * Autentica fora do try da logica de negocio. authenticate() lanca AuthError
 * (sessao/key invalida); aqui ela vira 401 em vez de 500.
 */
async function getAuth(req: NextRequest): Promise<{ auth: AuthResult } | { response: NextResponse }> {
  try {
    return { auth: await authenticate(req) }
  } catch (error) {
    return { response: handleApiErrorCors(error, '[ConversationEvents] Auth') }
  }
}

export async function POST(req: NextRequest) {
  const result = await getAuth(req)
  if ('response' in result) return result.response
  const { agentId, companyId } = result.auth
  if (!companyId) {
    return jsonResponse({ error: 'Restaurante nao encontrado' }, 403)
  }

  try {
    const body: unknown = await req.json().catch(() => null)
    const validation = createSchema.safeParse(body)
    if (!validation.success) {
      return jsonResponse(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        400
      )
    }
    const { conversation_id: conversationId, type, note } = validation.data

    // IDOR: a conversa precisa ser do restaurante autenticado.
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, companyId },
      select: { id: true, departmentId: true },
    })
    if (!conversation) {
      return jsonResponse({ error: 'Conversa nao encontrada' }, 404)
    }

    const metadata: Record<string, string> = { source: 'api' }
    if (note) metadata.note = note

    // Grava direto (sem o helper que engole erro): aqui o evento E a operacao,
    // o chamador precisa saber se falhou.
    const event = await prisma.conversationEvent.create({
      data: {
        companyId,
        conversationId,
        type,
        actor: agentId ? 'agent' : 'ai',
        userId: agentId ?? null,
        departmentId: conversation.departmentId,
        metadata,
      },
      select: {
        id: true,
        conversationId: true,
        type: true,
        actor: true,
        userId: true,
        departmentId: true,
        metadata: true,
        createdAt: true,
      },
    })

    return jsonResponse({ success: true, event }, 201)
  } catch (error) {
    return handleApiErrorCors(error, '[ConversationEvents] Erro ao registrar evento')
  }
}

export async function GET(req: NextRequest) {
  const result = await getAuth(req)
  if ('response' in result) return result.response
  const { companyId } = result.auth
  if (!companyId) {
    return jsonResponse({ error: 'Restaurante nao encontrado' }, 403)
  }

  try {
    const validation = listSchema.safeParse({
      conversationId: req.nextUrl.searchParams.get('conversationId') ?? '',
    })
    if (!validation.success) {
      return jsonResponse({ error: 'conversationId invalido' }, 400)
    }
    const { conversationId } = validation.data

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, companyId },
      select: { id: true },
    })
    if (!conversation) {
      return jsonResponse({ error: 'Conversa nao encontrada' }, 404)
    }

    const data = await prisma.conversationEvent.findMany({
      where: { conversationId, companyId },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true,
        conversationId: true,
        type: true,
        actor: true,
        userId: true,
        departmentId: true,
        metadata: true,
        createdAt: true,
      },
    })

    return jsonResponse({ data })
  } catch (error) {
    return handleApiErrorCors(error, '[ConversationEvents] Erro ao listar eventos')
  }
}
