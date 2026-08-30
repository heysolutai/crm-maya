import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { findOrCreateConversation } from '@/lib/api/database'
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors'
import { handleApiErrorCors } from '@/lib/api/errors'

/**
 * Registra (ou limpa) a executionUrl de uma conversa — a URL de resume de um
 * fluxo externo do n8n que esta aguardando a resposta do cliente (ex: fluxo
 * de avaliacao, node "Wait").
 *
 * Endpoint EXTERNO (x-api-key). Aceita snake_case e camelCase pra facilitar
 * o consumo no n8n. Identifica a conversa por conversation_id OU phone
 * (por telefone, cria a conversa se ainda nao existir — mesmo comportamento
 * do send-text).
 *
 * O desvio e ONE-SHOT: o webhook de entrada limpa o campo ao encaminhar a
 * mensagem, entao o fluxo deve re-registrar a URL a cada nova espera.
 * Enviar execution_url: null limpa manualmente (ex: fim do fluxo).
 */

const bodySchema = z.object({
  conversation_id: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  phone: z.string().min(5).max(30).optional(),
  execution_url: z.string().url().max(2000).nullable().optional(),
  executionUrl: z.string().url().max(2000).nullable().optional(),
})

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null)
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req)
    if (!auth.companyId) {
      return errorResponse('Empresa nao identificada', 403)
    }
    const companyId = auth.companyId

    const body = await req.json()
    const validation = bodySchema.safeParse(body)
    if (!validation.success) {
      return jsonResponse(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        400
      )
    }
    const d = validation.data

    // undefined = campo ausente (erro); null = limpar a URL.
    const executionUrl = d.execution_url !== undefined ? d.execution_url : d.executionUrl
    if (executionUrl === undefined) {
      return errorResponse('execution_url obrigatorio (use null para limpar)', 400)
    }

    const requestedId = d.conversation_id || d.conversationId

    let conversationId: string
    if (requestedId) {
      // IDOR: a conversa precisa ser da empresa autenticada.
      const conv = await prisma.conversation.findFirst({
        where: { id: requestedId, companyId },
        select: { id: true },
      })
      if (!conv) return errorResponse('Conversa nao encontrada', 404)
      conversationId = conv.id
    } else if (d.phone) {
      conversationId = await findOrCreateConversation(d.phone, companyId)
    } else {
      return errorResponse('Informe conversation_id ou phone', 400)
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { executionUrl },
    })

    return jsonResponse({
      success: true,
      conversation_id: conversationId,
      execution_url: executionUrl,
    })
  } catch (error) {
    return handleApiErrorCors(error, 'Erro ao registrar execution url')
  }
}
