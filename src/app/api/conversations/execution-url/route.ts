import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { findOrCreateConversation } from '@/lib/api/database'

import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors'
import { handleApiErrorCors } from '@/lib/api/errors'
import { publishEvent } from '@/lib/realtime'

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
  /// So https (validado abaixo, depois da compatibilidade com o formato antigo).
  execution_url: z.string().url().max(2000).nullable().optional(),
  executionUrl: z.string().url().max(2000).nullable().optional(),
  /// Validade da resume_url em segundos (60s a 7 dias). Vencida, o CRM ignora:
  /// a conversa volta pro fluxo de IA normal sozinha.
  /// coerce: o n8n manda body parameters como string ("86400").
  ttl_seconds: z.coerce.number().int().min(60).max(7 * 24 * 60 * 60).optional(),

  // ---- Log da execucao (aba "Logs da IA" da conversa) ----
  /// Orquestrador: 'n8n' (padrao), 'maestro', ...
  provider: z.string().trim().min(1).max(30).optional(),
  thread_id: z.string().trim().min(1).max(200).optional(),
  threadId: z.string().trim().min(1).max(200).optional(),
  run_id: z.string().trim().min(1).max(200).optional(),
  runId: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['started', 'running', 'success', 'error']).optional(),
  error: z.string().max(4000).optional(),
  error_message: z.string().max(4000).optional(),
  /// Mensagem do cliente que disparou (uuid do CRM, campo message_id do payload).
  /// Omitido = ultima mensagem do cliente na conversa.
  message_id: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
})

/**
 * Uma linha por execucao. Mesmo run_id na mesma conversa = atualiza a linha
 * (ex: 'started' e depois 'error'), pra aba nao mostrar a mesma execucao duas
 * vezes. Campos ausentes nao apagam o que ja foi registrado.
 */
async function registrarLog(input: {
  companyId: string
  conversationId: string
  messageId?: string
  provider: string
  threadId?: string
  runId?: string
  executionUrl?: string
  status?: string
  errorMessage?: string
}): Promise<string> {
  // Chave da execucao: run_id (Maestro: run da OpenAI; n8n: $execution.id).
  // Sem run_id, a propria URL da execucao identifica a linha.
  const chave = input.runId
    ? { runId: input.runId }
    : input.executionUrl
      ? { executionUrl: input.executionUrl }
      : null
  const existente = chave
    ? await prisma.executionLog.findFirst({
        where: { conversationId: input.conversationId, ...chave },
        select: { id: true },
      })
    : null

  if (existente) {
    await prisma.executionLog.update({
      where: { id: existente.id },
      data: {
        ...(input.threadId ? { threadId: input.threadId } : {}),
        ...(input.executionUrl ? { executionUrl: input.executionUrl } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
      },
    })
    return existente.id
  }

  // Mensagem que disparou: a informada (se for desta conversa) ou a ultima
  // do cliente. O fluxo roda a cada mensagem do cliente, entao e ela.
  let messageId: string | null = null
  if (input.messageId) {
    const msg = await prisma.message.findFirst({
      where: { id: input.messageId, conversationId: input.conversationId },
      select: { id: true },
    })
    messageId = msg?.id ?? null
  }
  if (!messageId) {
    const ultima = await prisma.message.findFirst({
      where: { conversationId: input.conversationId, senderType: 'client' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    messageId = ultima?.id ?? null
  }

  const log = await prisma.executionLog.create({
    data: {
      companyId: input.companyId,
      conversationId: input.conversationId,
      messageId,
      provider: input.provider,
      threadId: input.threadId ?? null,
      runId: input.runId ?? null,
      executionUrl: input.executionUrl ?? null,
      status: input.status ?? (input.errorMessage ? 'error' : null),
      errorMessage: input.errorMessage ?? null,
    },
    select: { id: true },
  })
  return log.id
}

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

    const threadId = d.thread_id ?? d.threadId
    const runId = d.run_id ?? d.runId
    const errorMessage = d.error_message ?? d.error
    // 'running' e sinonimo de 'started' (nome que alguns fluxos usam).
    const status = d.status === 'running' ? 'started' : d.status
    const temLog = !!(threadId || runId || status || errorMessage || typeof executionUrl === 'string')

    if (resumeUrl === undefined && executionUrl === undefined && !temLog) {
      return errorResponse('Informe resume_url, execution_url ou dados da execucao (thread_id, run_id, status)', 400)
    }

    // O link da execucao vira um botao clicavel no CRM: so https. A checagem
    // fica DEPOIS da compatibilidade acima de proposito — fluxo antigo que
    // manda a resume url (as vezes http interno) em `execution_url` continua
    // funcionando, porque ela ja foi movida pra resumeUrl.
    if (typeof executionUrl === 'string' && !executionUrl.toLowerCase().startsWith('https://')) {
      return jsonResponse(
        { error: 'Dados invalidos', details: { execution_url: ['A URL da execucao deve comecar com https://'] } },
        400
      )
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
      // Sem conversa: so pra ATUALIZAR uma execucao ja registrada, achada pelo
      // run_id (ou URL). E o caso do Error Trigger do n8n, que recebe o id da
      // execucao que falhou mas nao os dados dela. Escopo: o restaurante da
      // API key.
      const chave = runId
        ? { runId }
        : typeof executionUrl === 'string'
          ? { executionUrl }
          : null
      const anterior = chave
        ? await prisma.executionLog.findFirst({
            where: { companyId, ...chave },
            orderBy: { createdAt: 'desc' },
            select: { conversationId: true },
          })
        : null
      if (!anterior) {
        return errorResponse('Informe conversation_id ou phone (ou o run_id de uma execucao ja registrada)', 400)
      }
      conversationId = anterior.conversationId
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
        // Thread do orquestrador (Maestro): volta no payload da proxima mensagem.
        ...(threadId ? { aiThreadId: threadId } : {}),
      },
      select: { resumeUrl: true, resumeUrlExpiresAt: true, executionUrl: true, aiThreadId: true },
    })

    const logId = temLog
      ? await registrarLog({
          companyId,
          conversationId,
          messageId: d.message_id ?? d.messageId,
          provider: d.provider?.toLowerCase() ?? 'n8n',
          threadId,
          runId,
          executionUrl: typeof executionUrl === 'string' ? executionUrl : undefined,
          status,
          errorMessage,
        })
      : null

    if (temLog) {
      await publishEvent(companyId, { type: 'execution:log', conversationId, executionUrl: atualizada.executionUrl })
    }

    return jsonResponse({
      success: true,
      conversation_id: conversationId,
      resume_url: atualizada.resumeUrl,
      execution_url: atualizada.executionUrl,
      thread_id: atualizada.aiThreadId,
      expires_at: atualizada.resumeUrlExpiresAt,
      log_id: logId,
    })
  } catch (error) {
    return handleApiErrorCors(error, 'Erro ao registrar execution url')
  }
}
