import { Worker, Queue } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type CronTickJob } from '../queues'
import { prisma } from '@/lib/db'

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
      whatsappInstanceId: true,
      attempts: true,
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

      if (job.whatsappInstanceId) {
        const foundInstance = await prisma.whatsappInstance.findFirst({
          where: { id: job.whatsappInstanceId, isActive: true },
          select: { id: true, apiUrl: true, instanceApiKey: true },
        })
        if (foundInstance?.apiUrl && foundInstance?.instanceApiKey) {
          instance = { id: foundInstance.id, apiUrl: foundInstance.apiUrl, instanceApiKey: foundInstance.instanceApiKey }
        }
      }

      // Fallback: find any active instance for this company
      if (!instance) {
        const foundInstance = await prisma.whatsappInstance.findFirst({
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
        where: { id: job.clientId },
        select: { phone: true },
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

      // Check if conversation is still active (don't follow up closed conversations)
      if (job.conversationId) {
        const conv = await prisma.conversation.findFirst({
          where: { id: job.conversationId },
          select: { status: true },
        })

        if (conv?.status === 'closed') {
          console.log(`[Cron Follow-ups] Skipping job ${job.id} - conversation closed`)
          await prisma.followUpJob.update({
            where: { id: job.id },
            data: { status: 'cancelled', errorMessage: 'Conversation already closed' },
          })
          continue
        }
      }

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
          text: job.messageText,
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
            messageText: job.messageText,
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
