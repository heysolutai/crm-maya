import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { findOrCreateConversation } from '@/lib/api/database'

import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors'
import { handleApiErrorCors } from '@/lib/api/errors'

/**
 * Registra (ou limpa) os ponteiros do fluxo externo do n8n numa conversa.
 *
 * Sao DOIS campos, com papeis diferentes:
 *
 *   resume_url     O `webhook-waiting` do node Wait. E o que o CRM CHAMA pra
 *                  retomar a execucao quando o cliente responde. ONE-SHOT:
 *                  quem envia a mensagem consome, e o fluxo re-registra a cada
 *                  nova espera.
 *
 *   execution_url  O link pra ABRIR a execucao no n8n
 *                  (ex: https://n8n.host/workflow/<id>/executions/<id>).
 *                  O sistema nunca chama essa URL: ela existe pra alguem
 *                  clicar e ver o que aconteceu quando o fluxo trava no Wait
 *                  ou da erro. Nunca e limpa.
 *
 * Endpoint EXTERNO (x-api-key). Aceita snake_case e camelCase pra facilitar
 * o consumo no n8n. Identifica a conversa por conversation_id OU phone
 * (por telefone, cria a conversa se ainda nao existir: mesmo comportamento
 * do send-text).
 *
 * Enviar resume_url: null limpa manualmente (ex: fim do fluxo).
 */

// TTL default de 24h: cobre a janela de espera do fluxo de avaliacao.
const DEFAULT_TTL_SECONDS = 24 * 60 * 60

/**
 * Como se reconhece uma resume url do n8n. Usado so pra compatibilidade com os
 * fluxos antigos, que mandavam a resume url no campo `execution_url`.
 */
const PARECE_RESUME_URL = /webhook-waiting|\/webhook\//i

const bodySchema = z.object({
  conversation_id: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  phone: z.string().min(5).max(30).optional(),
  /// URL de resume (webhook-waiting) — a que o CRM chama.
  resume_url: z.string().url().max(2000).nullable().optional(),
  resumeUrl: z.string().url().max(2000).nullable().optional(),
  /// Link pra abrir a execucao no n8n — so pra gente ver, nunca e chamado.
  execution_url: z.string().url().max(2000).nullable().optional(),
  executionUrl: z.string().url().max(2000).nullable().optional(),
  /// Validade da resume_url em segundos (60s a 7 dias). Vencida, o CRM ignora:
  /// a conversa volta pro fluxo de IA normal sozinha.
  /// coerce: o n8n manda body parameters como string ("86400").
  ttl_seconds: z.coerce.number().int().min(60).max(7 * 24 * 60 * 60).optional(),
})

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null)
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req)
    if (!auth.companyId) {
      return errorResponse('Restaurante nao identificada', 403)
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

    // undefined = campo ausente; null = limpar.
    const primeiro = <T,>(...vs: (T | undefined)[]) => vs.find((v) => v !== undefined)

    let resumeUrl = primeiro(d.resume_url, d.resumeUrl)
    let executionUrl = primeiro(d.execution_url, d.executionUrl)

    // Compatibilidade: ate a v1.27 o campo `execution_url` ERA a resume url.
    // Fluxo antigo, que ainda manda so ele, continua funcionando — mas so
    // quando a URL tem cara de resume, pra nao chamar por engano um link de
    // execucao do n8n achando que e webhook.
    if (resumeUrl === undefined && typeof executionUrl === 'string' && PARECE_RESUME_URL.test(executionUrl)) {
      console.warn(
        '[ResumeUrl] Fluxo mandou a resume url em `execution_url` (formato antigo). ' +
        'Atualize o n8n para usar `resume_url`.'
      )
      resumeUrl = executionUrl
      executionUrl = undefined
    }

    // Mesma compatibilidade no sentido inverso: no formato antigo,
    // `execution_url: null` era como o fluxo dizia "acabei, pode limpar".
    // Sem isto, o fim do fluxo deixaria a resume url de pe e a proxima
    // mensagem do cliente tentaria retomar uma execucao ja encerrada.
    if (resumeUrl === undefined && executionUrl === null) {
      resumeUrl = null
    }

    if (resumeUrl === undefined && executionUrl === undefined) {
      return errorResponse('Informe resume_url e/ou execution_url (use null para limpar)', 400)
    }

    const requestedId = d.conversation_id || d.conversationId

    let conversationId: string
    if (requestedId) {
      // IDOR: a conversa precisa ser do restaurante autenticado.
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

    // TTL so entra quando esta REGISTRANDO uma resume url. Ao limpar, o prazo
    // fica como esta de proposito: ele e a janela do fluxo, e e o que segura o
    // follow-up fora da conversa depois que a url ja foi gasta.
    const resumeUrlExpiresAt = resumeUrl
      ? new Date(Date.now() + (d.ttl_seconds ?? DEFAULT_TTL_SECONDS) * 1000)
      : undefined

    const atualizada = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        // Cada campo so e tocado se veio no body: da pra registrar o link da
        // execucao sem mexer na resume url, e vice-versa.
        ...(resumeUrl !== undefined ? { resumeUrl } : {}),
        ...(resumeUrlExpiresAt !== undefined ? { resumeUrlExpiresAt } : {}),
        ...(executionUrl !== undefined ? { executionUrl } : {}),
      },
      select: { resumeUrl: true, resumeUrlExpiresAt: true, executionUrl: true },
    })

    return jsonResponse({
      success: true,
      conversation_id: conversationId,
      resume_url: atualizada.resumeUrl,
      execution_url: atualizada.executionUrl,
      expires_at: atualizada.resumeUrlExpiresAt,
    })
  } catch (error) {
    return handleApiErrorCors(error, 'Erro ao registrar execution url')
  }
}
