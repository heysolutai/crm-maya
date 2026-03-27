import { Worker, Queue } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type CronTickJob } from '../queues'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkWhatsAppStatus() {
  const supabase = createAdminClient()

  // Fetch all active WhatsApp instances
  const { data: instances, error } = await supabase
    .from('whatsapp_instances')
    .select('id, company_id, api_url, instance_api_key, status, instance_name')
    .eq('is_active', true)

  if (error) {
    console.error('[Cron WhatsApp Status] Error fetching instances:', error.message)
    return { checked: 0, errors: 1 }
  }

  if (!instances || instances.length === 0) {
    return { checked: 0, errors: 0 }
  }

  let checked = 0
  let errors = 0
  let statusChanges = 0

  for (const instance of instances) {
    try {
      // Call the WhatsApp API to check connection status
      const response = await fetch(`${instance.api_url}/status`, {
        method: 'GET',
        headers: {
          'token': instance.instance_api_key,
        },
        signal: AbortSignal.timeout(10000),
      })

      let newStatus: string
      let errorMessage: string | null = null

      if (!response.ok) {
        newStatus = 'disconnected'
        errorMessage = `API returned ${response.status}`
      } else {
        const data = await response.json()
        // UAZapi returns different status formats
        const apiStatus = data?.status || data?.state || data?.connectionStatus
        if (apiStatus === 'CONNECTED' || apiStatus === 'open' || apiStatus === 'connected') {
          newStatus = 'connected'
        } else if (apiStatus === 'SCANNING' || apiStatus === 'connecting') {
          newStatus = 'connecting'
        } else {
          newStatus = 'disconnected'
          errorMessage = `Status: ${apiStatus}`
        }
      }

      // Update if status changed
      if (newStatus !== instance.status) {
        await supabase
          .from('whatsapp_instances')
          .update({
            status: newStatus as any,
            error_message: errorMessage,
            last_checked_at: new Date().toISOString(),
          } as any)
          .eq('id', instance.id)

        statusChanges++
        console.log(
          `[Cron WhatsApp Status] Instance ${instance.instance_name || instance.id}: ${instance.status} → ${newStatus}`
        )
      } else {
        // Just update last_checked_at
        await supabase
          .from('whatsapp_instances')
          .update({ last_checked_at: new Date().toISOString() } as any)
          .eq('id', instance.id)
      }

      checked++
    } catch (err: any) {
      console.error(
        `[Cron WhatsApp Status] Error checking instance ${instance.instance_name || instance.id}:`,
        err.message
      )

      // Mark as disconnected on timeout/network error
      await supabase
        .from('whatsapp_instances')
        .update({
          status: 'disconnected' as any,
          error_message: err.message,
          last_checked_at: new Date().toISOString(),
        } as any)
        .eq('id', instance.id)

      errors++
    }
  }

  if (statusChanges > 0) {
    console.log(`[Cron WhatsApp Status] ${checked} checked, ${statusChanges} changed, ${errors} errors`)
  }

  return { checked, statusChanges, errors }
}

let worker: Worker<CronTickJob> | null = null

export function startWhatsAppStatusWorker() {
  if (worker) return worker

  const queue = new Queue<CronTickJob>(QUEUE_NAMES.CRON_WHATSAPP_STATUS, {
    connection: getRedisConnection(),
  })

  // Check every 5 minutes
  queue.upsertJobScheduler(
    'whatsapp-status-scheduler',
    { every: 300000 },
    { name: 'check-whatsapp-status', data: { triggeredAt: new Date().toISOString() } }
  ).catch(err => console.error('[Cron WhatsApp Status] Failed to create scheduler:', err.message))

  worker = new Worker<CronTickJob>(
    QUEUE_NAMES.CRON_WHATSAPP_STATUS,
    async () => {
      return checkWhatsAppStatus()
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    }
  )

  worker.on('completed', (job, result: any) => {
    if (result?.statusChanges > 0) {
      console.log(`[Cron WhatsApp Status] Job ${job.id}: ${result.statusChanges} status changes`)
    }
  })

  worker.on('failed', (job, err) => {
    console.error(`[Cron WhatsApp Status] Job ${job?.id} failed:`, err.message)
  })

  console.log('[Cron WhatsApp Status] Worker started (every 5min)')
  return worker
}
