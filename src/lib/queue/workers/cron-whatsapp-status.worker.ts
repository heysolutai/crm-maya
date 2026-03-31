import { Worker, Queue } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type CronTickJob } from '../queues'
import { prisma } from '@/lib/db'

async function checkWhatsAppStatus() {
  // Fetch all active WhatsApp instances
  const instances = await prisma.whatsappInstance.findMany({
    where: { isActive: true },
    select: {
      id: true,
      companyId: true,
      apiUrl: true,
      instanceApiKey: true,
      status: true,
      instanceName: true,
    },
  })

  if (!instances || instances.length === 0) {
    return { checked: 0, errors: 0 }
  }

  let checked = 0
  let errors = 0
  let statusChanges = 0

  for (const instance of instances) {
    try {
      // Call the WhatsApp API to check connection status
      const response = await fetch(`${instance.apiUrl}/status`, {
        method: 'GET',
        headers: {
          'token': instance.instanceApiKey || '',
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
        await prisma.whatsappInstance.update({
          where: { id: instance.id },
          data: {
            status: newStatus,
            errorMessage: errorMessage,
          },
        })

        statusChanges++
        console.log(
          `[Cron WhatsApp Status] Instance ${instance.instanceName || instance.id}: ${instance.status} → ${newStatus}`
        )
      } else {
        // Just update lastCheckedAt
        await prisma.whatsappInstance.update({
          where: { id: instance.id },
          data: { updatedAt: new Date() },
        })
      }

      checked++
    } catch (err: any) {
      console.error(
        `[Cron WhatsApp Status] Error checking instance ${instance.instanceName || instance.id}:`,
        err.message
      )

      // Mark as disconnected on timeout/network error
      await prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: {
          status: 'disconnected',
          errorMessage: err.message,
          updatedAt: new Date(),
        },
      })

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
