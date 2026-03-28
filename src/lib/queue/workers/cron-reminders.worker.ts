import { Worker, Queue } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type CronTickJob } from '../queues'
import { prisma } from '@/lib/db'

async function processReminders() {
  // Fetch pending reminders that are due
  const reminders = await prisma.reminder.findMany({
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
      messageText: true,
      attempts: true,
      appointmentId: true,
      reminderType: true,
      scheduledFor: true,
    },
    orderBy: { scheduledFor: 'asc' },
    take: 30,
  })

  if (!reminders || reminders.length === 0) {
    return { processed: 0, errors: 0 }
  }

  console.log(`[Cron Reminders] Processing ${reminders.length} pending reminders`)

  let processed = 0
  let errors = 0

  for (const reminder of reminders) {
    try {
      // Increment attempts
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { attempts: (reminder.attempts || 0) + 1, status: 'processing' },
      })

      // Get WhatsApp instance for this company
      const instance = await prisma.whatsappInstance.findFirst({
        where: { companyId: reminder.companyId, isActive: true },
        select: { id: true, apiUrl: true, instanceApiKey: true },
      })

      if (!instance) {
        console.warn(`[Cron Reminders] No active WhatsApp instance for company ${reminder.companyId}`)
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: 'failed', errorMessage: 'No active WhatsApp instance' },
        })
        errors++
        continue
      }

      // Get client phone number
      const client = await prisma.client.findFirst({
        where: { id: reminder.clientId },
        select: { phone: true },
      })

      if (!client?.phone) {
        console.warn(`[Cron Reminders] No phone for client ${reminder.clientId}`)
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: 'failed', errorMessage: 'Client has no phone' },
        })
        errors++
        continue
      }

      // Send WhatsApp message via API
      const cleanPhone = client.phone.replace(/[^0-9]/g, '')
      const response = await fetch(`${instance.apiUrl}/send/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': instance.instanceApiKey,
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: reminder.messageText,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`WhatsApp API error (${response.status}): ${errorText}`)
      }

      const result = await response.json()
      const waMessageId = result?.key?.id || result?.message_id

      // Save message to conversation if exists
      if (reminder.conversationId) {
        await prisma.message.create({
          data: {
            conversationId: reminder.conversationId,
            senderType: 'system',
            messageText: reminder.messageText,
            messageType: 'text',
            metadata: {
              reminder_id: reminder.id,
              reminder_type: reminder.reminderType,
              appointment_id: reminder.appointmentId,
              wa_message_id: waMessageId,
              sent_via: 'cron_worker',
            },
          },
        })
      }

      // Mark as sent
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
        },
      })

      processed++
      console.log(`[Cron Reminders] Sent reminder ${reminder.id} to ${cleanPhone}`)

    } catch (err: any) {
      console.error(`[Cron Reminders] Error processing reminder ${reminder.id}:`, err.message)

      // Mark as pending again if attempts < 3, otherwise failed
      const newAttempts = (reminder.attempts || 0) + 1
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: {
          status: newAttempts >= 3 ? 'failed' : 'pending',
          errorMessage: err.message,
        },
      })

      errors++
    }
  }

  console.log(`[Cron Reminders] Done: ${processed} sent, ${errors} errors`)
  return { processed, errors }
}

let worker: Worker<CronTickJob> | null = null

export function startRemindersWorker() {
  if (worker) return worker

  // Create queue and add repeatable job (every 60 seconds)
  const queue = new Queue<CronTickJob>(QUEUE_NAMES.CRON_REMINDERS, {
    connection: getRedisConnection(),
  })

  queue.upsertJobScheduler(
    'reminders-scheduler',
    { every: 60000 },
    { name: 'process-reminders', data: { triggeredAt: new Date().toISOString() } }
  ).catch(err => console.error('[Cron Reminders] Failed to create scheduler:', err.message))

  worker = new Worker<CronTickJob>(
    QUEUE_NAMES.CRON_REMINDERS,
    async () => {
      return processReminders()
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    }
  )

  worker.on('completed', (job, result: any) => {
    if (result?.processed > 0) {
      console.log(`[Cron Reminders] Job ${job.id} completed: ${result.processed} sent`)
    }
  })

  worker.on('failed', (job, err) => {
    console.error(`[Cron Reminders] Job ${job?.id} failed:`, err.message)
  })

  console.log('[Cron Reminders] Worker started (every 60s)')
  return worker
}
