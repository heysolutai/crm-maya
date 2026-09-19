import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type N8NWebhookJob } from '../queues'
import { prisma } from '@/lib/db'

/**
 * So agrupa mensagem recente. A marca `n8n_enviado_em` nao existe em nada que
 * foi gravado antes desse recurso, entao sem uma janela a primeira execucao
 * depois do deploy juntaria o historico inteiro da conversa num texto so.
 */
const JANELA_AGRUPAMENTO_MS = 5 * 60 * 1000

/**
 * Junta as mensagens do cliente que ainda nao foram pro fluxo.
 *
 * Com a espera do agrupamento, quando este job roda pode haver varias
 * mensagens curtas acumuladas na conversa. Mandar so a ultima faria a IA
 * responder a um pedaco ("Comece?") sem o resto. Aqui elas viram um texto so,
 * na ordem em que chegaram.
 *
 * Cada mensagem enviada recebe uma marca, pra nao ir duas vezes se outro job
 * rodar depois.
 */
async function juntarMensagensPendentes(
  companyId: string,
  conversationId: string,
  messageId: string
): Promise<{ texto: string | null; ids: string[] }> {
  // Da mais NOVA pra mais velha: com `asc` + `take`, uma conversa longa
  // devolvia as 30 primeiras (ja enviadas ha tempo) e o agrupamento parava
  // de funcionar justamente em quem mais conversa.
  const candidatas = await prisma.message.findMany({
    where: {
      conversationId,
      conversation: { companyId },
      senderType: 'client',
      messageText: { not: null },
      createdAt: { gte: new Date(Date.now() - JANELA_AGRUPAMENTO_MS) },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, messageText: true, metadata: true },
  })

  // Anda do fim pro comeco e para na primeira ja enviada: o que interessa e a
  // ponta pendente da conversa, nao qualquer buraco no meio do historico.
  const pendentes: { id: string; texto: string }[] = []
  for (const m of candidatas) {
    const meta = (m.metadata || {}) as Record<string, unknown>
    if (meta.n8n_enviado_em) break
    const texto = (m.messageText || '').trim()
    if (texto.length > 0) pendentes.unshift({ id: m.id, texto })
  }

  // Nada acumulado (ou so a propria mensagem): segue com o payload original.
  if (pendentes.length <= 1) {
    return { texto: null, ids: pendentes.map((m) => m.id) }
  }

  console.log(
    `[N8N Worker] juntando ${pendentes.length} mensagens da conversa ${conversationId} ` +
    `(disparo pela mensagem ${messageId})`
  )
  return {
    texto: pendentes.map((m) => m.texto).join('\n'),
    ids: pendentes.map((m) => m.id),
  }
}

/**
 * Marca o que ja foi pro fluxo, pra nao repetir no proximo job.
 *
 * Um UPDATE so, com merge de jsonb no proprio banco: ler e reescrever o
 * metadata em duas idas perderia o que outro worker gravou no meio do caminho.
 */
async function marcarComoEnviadas(ids: string[]): Promise<void> {
  const agora = new Date().toISOString()
  await prisma.$executeRaw`
    UPDATE messages
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('n8n_enviado_em', ${agora}::text)
    WHERE id = ANY(${ids}::uuid[])
  `.catch((e: unknown) => {
    console.error('[N8N Worker] Falha ao marcar mensagens como enviadas:', e)
  })
}

async function processN8NWebhook(job: Job<N8NWebhookJob>) {
  const { webhookUrl, payload, companyId, conversationId, messageId, agrupar } = job.data

  console.log(`[N8N Worker] Processing job ${job.id} for message ${messageId}`)

  // Agrupar so vale pra mensagem de cliente que passou pela espera. Sem essa
  // porta, o payload de uma mensagem ENVIADA pelo atendente tambem teria o
  // `conteudo` trocado pelo texto do cliente que estivesse pendente.
  let texto: string | null = null
  let ids: string[] = []

  if (agrupar) {
    // Outro job pode ter levado essa mensagem enquanto este esperava. Se ja
    // foi, nao ha o que mandar de novo.
    const propria = await prisma.message.findFirst({
      where: { id: messageId, conversation: { companyId } },
      select: { metadata: true },
    })
    const meta = (propria?.metadata || {}) as Record<string, unknown>
    if (meta.n8n_enviado_em) {
      console.log(`[N8N Worker] Mensagem ${messageId} ja foi pro fluxo; nada a fazer`)
      return { skipped: true }
    }

    const agrupadas = await juntarMensagensPendentes(companyId, conversationId, messageId)
    texto = agrupadas.texto
    ids = agrupadas.ids
  }

  const corpo = texto ? { ...payload, conteudo: texto, mensagens_agrupadas: ids.length } : payload

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`N8N webhook returned ${response.status}: ${errorText}`)
  }

  console.log(`[N8N Worker] Successfully sent to N8N (status: ${response.status}) for message ${messageId}`)

  // So marca depois do envio dar certo: se falhar, o retry leva tudo de novo.
  if (ids.length > 0) await marcarComoEnviadas(ids)

  // Send typing indicator if AI is active (5s delay)
  const aiStatus = payload.ai_status as string
  if (aiStatus === 'active') {
    try {
      const phone = payload.numero_cliente as string

      // Wait 5 seconds before sending typing indicator
      await new Promise(resolve => setTimeout(resolve, 5000))

      // Resolve a inbox desta conversa pra usar as credenciais certas
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { inboxId: true },
      })

      const instance = conv?.inboxId
        ? await prisma.inbox.findUnique({
            where: { id: conv.inboxId },
            select: { id: true, apiUrl: true, instanceApiKey: true, channelType: true, aiAgentId: true },
          })
        : await prisma.inbox.findFirst({
            where: { companyId, isActive: true },
            select: { id: true, apiUrl: true, instanceApiKey: true, channelType: true, aiAgentId: true },
          })

      // Typing indicator hoje so funciona pra UazAPI (endpoint /message/presence
      // proprio do UazAPI). Pula pra outros canais ate ter helper proprio.
      if (instance?.apiUrl && instance?.instanceApiKey && instance.channelType === 'uazapi') {
        const aiConfig = instance.aiAgentId
          ? await prisma.aiAgent.findFirst({
              where: { id: instance.aiAgentId, isActive: true },
              select: { behaviorSettings: true },
            })
          : await prisma.aiAgent.findFirst({
              where: { companyId, isActive: true },
              select: { behaviorSettings: true },
            })

        const behaviorSettings = aiConfig?.behaviorSettings as Record<string, unknown> | null
        const typingDelayMs = (behaviorSettings?.typing_indicator_delay_ms as number) || 30000

        await fetch(`${instance.apiUrl}/message/presence`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': instance.instanceApiKey,
          },
          body: JSON.stringify({
            number: phone,
            presence: 'composing',
            delay: typingDelayMs,
          }),
        })

        console.log(`[N8N Worker] Typing indicator sent for ${phone}`)
      }
    } catch (typingError) {
      // Don't fail the job for typing indicator errors
      console.warn('[N8N Worker] Typing indicator error:', typingError)
    }
  }

  return { status: response.status, messageId }
}

let worker: Worker<N8NWebhookJob> | null = null

export function startN8NWebhookWorker() {
  if (worker) return worker

  worker = new Worker<N8NWebhookJob>(
    QUEUE_NAMES.N8N_WEBHOOK,
    processN8NWebhook,
    {
      connection: getRedisConnection(),
      concurrency: 5, // Process up to 5 N8N calls in parallel
      limiter: {
        max: 20,
        duration: 1000, // Max 20 calls per second to N8N
      },
    }
  )

  worker.on('completed', (job) => {
    console.log(`[N8N Worker] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[N8N Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message)
  })

  console.log('[N8N Worker] Started')
  return worker
}

export function stopN8NWebhookWorker() {
  if (worker) {
    worker.close()
    worker = null
  }
}
