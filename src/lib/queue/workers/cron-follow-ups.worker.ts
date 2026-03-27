import { Worker, Queue } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type CronTickJob } from '../queues'
import { createAdminClient } from '@/lib/supabase/admin'

async function processFollowUps() {
  const supabase = createAdminClient()

  // Fetch pending follow-up jobs that are due
  const { data: jobs, error } = await supabase
    .from('follow_up_jobs')
    .select(`
      id, company_id, conversation_id, client_id,
      stage_order, message_text, whatsapp_instance_id, attempts
    `)
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .lt('attempts', 3)
    .order('scheduled_for', { ascending: true })
    .limit(30)

  if (error) {
    console.error('[Cron Follow-ups] Error fetching jobs:', error.message)
    return { processed: 0, errors: 1 }
  }

  if (!jobs || jobs.length === 0) {
    return { processed: 0, errors: 0 }
  }

  console.log(`[Cron Follow-ups] Processing ${jobs.length} pending follow-up jobs`)

  let processed = 0
  let errors = 0

  for (const job of jobs) {
    try {
      // Increment attempts and mark as processing
      await supabase
        .from('follow_up_jobs')
        .update({ attempts: (job.attempts || 0) + 1, status: 'processing' } as any)
        .eq('id', job.id)

      // Get WhatsApp instance
      let instanceId = job.whatsapp_instance_id
      let instance: any = null

      if (instanceId) {
        const { data } = await supabase
          .from('whatsapp_instances')
          .select('id, api_url, instance_api_key')
          .eq('id', instanceId)
          .eq('is_active', true)
          .single()
        instance = data
      }

      // Fallback: find any active instance for this company
      if (!instance) {
        const { data } = await supabase
          .from('whatsapp_instances')
          .select('id, api_url, instance_api_key')
          .eq('company_id', job.company_id)
          .eq('is_active', true)
          .single()
        instance = data
      }

      if (!instance) {
        console.warn(`[Cron Follow-ups] No active WhatsApp instance for company ${job.company_id}`)
        await supabase
          .from('follow_up_jobs')
          .update({ status: 'failed', error_message: 'No active WhatsApp instance' } as any)
          .eq('id', job.id)
        errors++
        continue
      }

      // Get client phone
      const { data: client } = await supabase
        .from('clients')
        .select('phone')
        .eq('id', job.client_id)
        .single()

      if (!client?.phone) {
        console.warn(`[Cron Follow-ups] No phone for client ${job.client_id}`)
        await supabase
          .from('follow_up_jobs')
          .update({ status: 'failed', error_message: 'Client has no phone' } as any)
          .eq('id', job.id)
        errors++
        continue
      }

      // Check if conversation is still active (don't follow up closed conversations)
      if (job.conversation_id) {
        const { data: conv } = await supabase
          .from('conversations')
          .select('status')
          .eq('id', job.conversation_id)
          .single()

        if (conv?.status === 'closed') {
          console.log(`[Cron Follow-ups] Skipping job ${job.id} - conversation closed`)
          await supabase
            .from('follow_up_jobs')
            .update({ status: 'cancelled', error_message: 'Conversation already closed' } as any)
            .eq('id', job.id)
          continue
        }
      }

      // Send WhatsApp message
      const cleanPhone = client.phone.replace(/[^0-9]/g, '')
      const response = await fetch(`${instance.api_url}/send/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': instance.instance_api_key,
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: job.message_text,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`WhatsApp API error (${response.status}): ${errorText}`)
      }

      const result = await response.json()
      const waMessageId = result?.key?.id || result?.message_id

      // Save message to conversation
      if (job.conversation_id) {
        await supabase.from('messages').insert({
          conversation_id: job.conversation_id,
          sender_type: 'ai',
          message_text: job.message_text,
          message_type: 'text',
          metadata: {
            follow_up_job_id: job.id,
            stage_order: job.stage_order,
            wa_message_id: waMessageId,
            sent_via: 'cron_worker',
          },
        } as any)
      }

      // Mark as sent
      await supabase
        .from('follow_up_jobs')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        } as any)
        .eq('id', job.id)

      processed++
      console.log(`[Cron Follow-ups] Sent follow-up ${job.id} (stage ${job.stage_order}) to ${cleanPhone}`)

    } catch (err: any) {
      console.error(`[Cron Follow-ups] Error processing job ${job.id}:`, err.message)

      const newAttempts = (job.attempts || 0) + 1
      await supabase
        .from('follow_up_jobs')
        .update({
          status: newAttempts >= 3 ? 'failed' : 'pending',
          error_message: err.message,
        } as any)
        .eq('id', job.id)

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
