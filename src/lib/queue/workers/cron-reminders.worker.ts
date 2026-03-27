import { Worker, Queue } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type CronTickJob } from '../queues'
import { createAdminClient } from '@/lib/supabase/admin'

async function processReminders() {
  const supabase = createAdminClient()

  // Fetch pending reminders that are due
  const { data: reminders, error } = await supabase
    .from('reminders')
    .select(`
      id, company_id, conversation_id, client_id,
      message_text, attempts, appointment_id, reminder_type, scheduled_for
    `)
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .lt('attempts', 3)
    .order('scheduled_for', { ascending: true })
    .limit(30)

  if (error) {
    console.error('[Cron Reminders] Error fetching reminders:', error.message)
    return { processed: 0, errors: 1 }
  }

  if (!reminders || reminders.length === 0) {
    return { processed: 0, errors: 0 }
  }

  console.log(`[Cron Reminders] Processing ${reminders.length} pending reminders`)

  let processed = 0
  let errors = 0

  for (const reminder of reminders) {
    try {
      // Increment attempts
      await supabase
        .from('reminders')
        .update({ attempts: (reminder.attempts || 0) + 1, status: 'processing' } as any)
        .eq('id', reminder.id)

      // Get WhatsApp instance for this company
      const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('id, api_url, instance_api_key')
        .eq('company_id', reminder.company_id)
        .eq('is_active', true)
        .single()

      if (!instance) {
        console.warn(`[Cron Reminders] No active WhatsApp instance for company ${reminder.company_id}`)
        await supabase
          .from('reminders')
          .update({ status: 'failed', error_message: 'No active WhatsApp instance' } as any)
          .eq('id', reminder.id)
        errors++
        continue
      }

      // Get client phone number
      const { data: client } = await supabase
        .from('clients')
        .select('phone')
        .eq('id', reminder.client_id)
        .single()

      if (!client?.phone) {
        console.warn(`[Cron Reminders] No phone for client ${reminder.client_id}`)
        await supabase
          .from('reminders')
          .update({ status: 'failed', error_message: 'Client has no phone' } as any)
          .eq('id', reminder.id)
        errors++
        continue
      }

      // Send WhatsApp message via API
      const cleanPhone = client.phone.replace(/[^0-9]/g, '')
      const response = await fetch(`${instance.api_url}/send/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': instance.instance_api_key,
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: reminder.message_text,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`WhatsApp API error (${response.status}): ${errorText}`)
      }

      const result = await response.json()
      const waMessageId = result?.key?.id || result?.message_id

      // Save message to conversation if exists
      if (reminder.conversation_id) {
        await supabase.from('messages').insert({
          conversation_id: reminder.conversation_id,
          sender_type: 'system',
          message_text: reminder.message_text,
          message_type: 'text',
          metadata: {
            reminder_id: reminder.id,
            reminder_type: reminder.reminder_type,
            appointment_id: reminder.appointment_id,
            wa_message_id: waMessageId,
            sent_via: 'cron_worker',
          },
        } as any)
      }

      // Mark as sent
      await supabase
        .from('reminders')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        } as any)
        .eq('id', reminder.id)

      processed++
      console.log(`[Cron Reminders] Sent reminder ${reminder.id} to ${cleanPhone}`)

    } catch (err: any) {
      console.error(`[Cron Reminders] Error processing reminder ${reminder.id}:`, err.message)

      // Mark as pending again if attempts < 3, otherwise failed
      const newAttempts = (reminder.attempts || 0) + 1
      await supabase
        .from('reminders')
        .update({
          status: newAttempts >= 3 ? 'failed' : 'pending',
          error_message: err.message,
        } as any)
        .eq('id', reminder.id)

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
