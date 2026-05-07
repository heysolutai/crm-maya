import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type N8NWebhookJob } from '../queues'
import { prisma } from '@/lib/db'

async function processN8NWebhook(job: Job<N8NWebhookJob>) {
  const { webhookUrl, payload, companyId, conversationId, messageId } = job.data

  console.log(`[N8N Worker] Processing job ${job.id} for message ${messageId}`)

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`N8N webhook returned ${response.status}: ${errorText}`)
  }

  console.log(`[N8N Worker] Successfully sent to N8N (status: ${response.status}) for message ${messageId}`)

  // Send typing indicator if AI is active (5s delay)
  const aiStatus = payload.ai_status as string
  if (aiStatus === 'active') {
    try {
      const phone = payload.numero_cliente as string

      // Wait 5 seconds before sending typing indicator
      await new Promise(resolve => setTimeout(resolve, 5000))

      // Resolve o agente desta conversa pra usar a instancia certa
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { whatsappInstanceId: true },
      })

      const instance = conv?.whatsappInstanceId
        ? await prisma.whatsappInstance.findUnique({
            where: { id: conv.whatsappInstanceId },
            select: { id: true, apiUrl: true, instanceApiKey: true, channelType: true },
          })
        : await prisma.whatsappInstance.findFirst({
            where: { companyId, isActive: true },
            select: { id: true, apiUrl: true, instanceApiKey: true, channelType: true },
          })

      // Typing indicator hoje so funciona pra UazAPI (endpoint /message/presence
      // proprio do UazAPI). Pula pra outros canais ate ter helper proprio.
      if (instance?.apiUrl && instance?.instanceApiKey && instance.channelType === 'uazapi') {
        const aiConfig = await prisma.aiConfiguration.findFirst({
          where: { whatsappInstanceId: instance.id, isActive: true },
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
