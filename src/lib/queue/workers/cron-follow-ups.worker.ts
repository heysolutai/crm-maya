import { Worker, Queue } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type CronTickJob } from '../queues'
import { prisma } from '@/lib/db'
import { prepararTextoParaWhatsApp } from '@/lib/whatsapp/texto-whatsapp'

interface EtapaFollowUp {
  order?: number | string
  message?: string
  enabled?: boolean
}

type Conferencia = { cancelar: string } | { texto: string }

/**
 * Confere, NA HORA DO ENVIO, se o follow-up ainda deve sair e com qual texto.
 *
 * Antes o worker so olhava se a conversa estava fechada e mandava o
 * `messageText` congelado no job. Todas as travas (follow-up desligado, IA
 * pausada, conversa de avaliacao) valiam so na CRIACAO do job, entao nada que
 * se corrigia depois alcancava os jobs ja agendados: etapa com texto errado ou
 * follow-up desligado continuavam saindo por dias (etapas de 24h, 72h, 168h).
 *
 * Agora a configuracao do agente e a fonte da verdade no envio: desligou,
 * apagou a etapa ou corrigiu o texto, o job obedece.
 */
async function conferirEnvio(
  job: { companyId: string; conversationId: string | null; inboxId: string | null; stageOrder: number; createdAt: Date },
  client: { firstName: string; phone: string | null; aiPaused: boolean }
): Promise<Conferencia> {
  if (client.aiPaused) return { cancelar: 'IA pausada para o cliente (atendimento manual)' }

  // Mesmo agente que a criacao usa: o da inbox, senao o primeiro ativo.
  const inbox = job.inboxId
    ? await prisma.inbox.findFirst({
        where: { id: job.inboxId, companyId: job.companyId },
        select: { aiAgentId: true },
      })
    : null
  const agente = inbox?.aiAgentId
    ? await prisma.aiAgent.findFirst({
        where: { id: inbox.aiAgentId, companyId: job.companyId, isActive: true },
        select: { followUpEnabled: true, followUpStages: true },
      })
    : await prisma.aiAgent.findFirst({
        where: { companyId: job.companyId, isActive: true },
        select: { followUpEnabled: true, followUpStages: true },
      })
  if (!agente?.followUpEnabled) return { cancelar: 'Follow-up desligado no agente' }

  const etapas = Array.isArray(agente.followUpStages) ? (agente.followUpStages as EtapaFollowUp[]) : []
  const etapa = etapas.find((e) => Number(e.order) === job.stageOrder && e.enabled !== false)
  if (!etapa) return { cancelar: `Etapa ${job.stageOrder} removida ou desligada` }
  if (!etapa.message?.trim()) return { cancelar: `Etapa ${job.stageOrder} sem texto` }

  if (job.conversationId) {
    const conversa = await prisma.conversation.findFirst({
      where: { id: job.conversationId, companyId: job.companyId },
      select: { status: true, resumeUrlExpiresAt: true },
    })
    if (conversa?.status === 'closed') return { cancelar: 'Conversation already closed' }

    // Fluxo externo (avaliacao) esteve na conversa durante a vida do job: a
    // conversa passou a ser do fluxo. `resumeUrlExpiresAt` nao e limpo junto
    // com a url, entao continua marcando a janela mesmo depois de vencer.
    if (conversa?.resumeUrlExpiresAt && conversa.resumeUrlExpiresAt > job.createdAt) {
      return { cancelar: 'Conversa entrou em fluxo externo (avaliacao) depois do agendamento' }
    }

    const avaliacao = await prisma.review.findFirst({
      where: { conversationId: job.conversationId, companyId: job.companyId },
      select: { id: true },
    })
    if (avaliacao) return { cancelar: 'Conversa de avaliacao' }
  }

  const texto = etapa.message
    .replace(/\[client_name\]/g, client.firstName || 'Cliente')
    .replace(/\[client_phone\]/g, client.phone || '')
  return { texto }
}

async function processFollowUps() {
  // Fetch pending follow-up jobs that are due
  const jobs = await prisma.followUpJob.findMany({
    where: {
      status: 'pending',
      scheduledFor: { lte: new Date() },
      attempts: { lt: 3 },
    },
    select: {
      id: true,
      companyId: true,
      conversationId: true,
      clientId: true,
      stageOrder: true,
      messageText: true,
      inboxId: true,
      attempts: true,
      createdAt: true,
    },
    orderBy: { scheduledFor: 'asc' },
    take: 30,
  })

  if (!jobs || jobs.length === 0) {
    return { processed: 0, errors: 0 }
  }

  console.log(`[Cron Follow-ups] Processing ${jobs.length} pending follow-up jobs`)

  let processed = 0
  let errors = 0

  for (const job of jobs) {
    try {
      // Increment attempts and mark as processing
      await prisma.followUpJob.update({
        where: { id: job.id },
        data: { attempts: (job.attempts || 0) + 1, status: 'processing' },
      })

      // Get WhatsApp instance
      let instance: { id: string; apiUrl: string; instanceApiKey: string } | null = null

      if (job.inboxId) {
        const foundInstance = await prisma.inbox.findFirst({
          where: { id: job.inboxId, isActive: true },
          select: { id: true, apiUrl: true, instanceApiKey: true },
        })
        if (foundInstance?.apiUrl && foundInstance?.instanceApiKey) {
          instance = { id: foundInstance.id, apiUrl: foundInstance.apiUrl, instanceApiKey: foundInstance.instanceApiKey }
        }
      }

      // Fallback: find any active inbox for this company
      if (!instance) {
        const foundInstance = await prisma.inbox.findFirst({
          where: { companyId: job.companyId, isActive: true },
          select: { id: true, apiUrl: true, instanceApiKey: true },
        })
        if (foundInstance?.apiUrl && foundInstance?.instanceApiKey) {
          instance = { id: foundInstance.id, apiUrl: foundInstance.apiUrl, instanceApiKey: foundInstance.instanceApiKey }
        }
      }

      if (!instance) {
        console.warn(`[Cron Follow-ups] No active WhatsApp instance for company ${job.companyId}`)
        await prisma.followUpJob.update({
          where: { id: job.id },
          data: { status: 'failed', errorMessage: 'No active WhatsApp instance' },
        })
        errors++
        continue
      }

      // Get client phone
      if (!job.clientId) {
        console.warn(`[Cron Follow-ups] No clientId for job ${job.id}`)
        await prisma.followUpJob.update({
          where: { id: job.id },
          data: { status: 'failed', errorMessage: 'Job has no client ID' },
        })
        errors++
        continue
      }

      const client = await prisma.client.findFirst({
        where: { id: job.clientId, companyId: job.companyId },
        select: { phone: true, firstName: true, aiPaused: true },
      })

      if (!client?.phone) {
        console.warn(`[Cron Follow-ups] No phone for client ${job.clientId}`)
        await prisma.followUpJob.update({
          where: { id: job.id },
          data: { status: 'failed', errorMessage: 'Client has no phone' },
        })
        errors++
        continue
      }

      // Travas e texto conferidos no envio, contra a configuracao ATUAL do
      // agente (ver `conferirEnvio`). O `messageText` do job fica so de registro.
      const conferido = await conferirEnvio(job, client)
      if ('cancelar' in conferido) {
        console.log(`[Cron Follow-ups] Job ${job.id} cancelado: ${conferido.cancelar}`)
        await prisma.followUpJob.update({
          where: { id: job.id },
          data: { status: 'cancelled', errorMessage: conferido.cancelar },
        })
        continue
      }
      // Mesma normalizacao de todo texto que sai (markdown, "\n" literal, travessao).
      const texto = prepararTextoParaWhatsApp(conferido.texto)

      // Send WhatsApp message
      const cleanPhone = client.phone.replace(/[^0-9]/g, '')
      const response = await fetch(`${instance.apiUrl}/send/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': instance.instanceApiKey,
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: texto,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`WhatsApp API error (${response.status}): ${errorText}`)
      }

      const result = await response.json()
      const waMessageId = result?.key?.id || result?.message_id

      // Save message to conversation
      if (job.conversationId) {
        await prisma.message.create({
          data: {
            conversationId: job.conversationId,
            senderType: 'ai',
            messageText: texto,
            messageType: 'text',
            metadata: {
              follow_up_job_id: job.id,
              stage_order: job.stageOrder,
              wa_message_id: waMessageId,
              sent_via: 'cron_worker',
            },
          },
        })
      }

      // Mark as sent
      await prisma.followUpJob.update({
        where: { id: job.id },
        data: {
          status: 'sent',
          lastAttemptAt: new Date(),
        },
      })

      processed++
      console.log(`[Cron Follow-ups] Sent follow-up ${job.id} (stage ${job.stageOrder}) to ${cleanPhone}`)

    } catch (err: any) {
      console.error(`[Cron Follow-ups] Error processing job ${job.id}:`, err.message)

      const newAttempts = (job.attempts || 0) + 1
      await prisma.followUpJob.update({
        where: { id: job.id },
        data: {
          status: newAttempts >= 3 ? 'failed' : 'pending',
          errorMessage: err.message,
        },
      })

      errors++
    }
  }

  console.log(`[Cron Follow-ups] Done: ${processed} sent, ${errors} errors`)
  return { processed, errors }
}

let worker: Worker<CronTickJob> | null = null

export function startFollowUpsWorker() {
  if (worker) return worker

  const queue = new Queue<CronTickJob>(QUEUE_NAMES.CRON_FOLLOW_UPS, {
    connection: getRedisConnection(),
  })

  queue.upsertJobScheduler(
    'follow-ups-scheduler',
    { every: 60000 },
    { name: 'process-follow-ups', data: { triggeredAt: new Date().toISOString() } }
  ).catch(err => console.error('[Cron Follow-ups] Failed to create scheduler:', err.message))

  worker = new Worker<CronTickJob>(
    QUEUE_NAMES.CRON_FOLLOW_UPS,
    async () => {
      return processFollowUps()
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    }
  )

  worker.on('completed', (job, result: any) => {
    if (result?.processed > 0) {
      console.log(`[Cron Follow-ups] Job ${job.id} completed: ${result.processed} sent`)
    }
  })

  worker.on('failed', (job, err) => {
    console.error(`[Cron Follow-ups] Job ${job?.id} failed:`, err.message)
  })

  console.log('[Cron Follow-ups] Worker started (every 60s)')
  return worker
}
