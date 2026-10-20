import { Worker, Queue } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type CronTickJob } from '../queues'
import { prisma } from '@/lib/db'
import { getCovercutNumberStatus } from '@/lib/channels/covercut'

/**
 * WhatsApp Cloud: status vem da Covercut (Graph API). Erro de rede nao muda
 * nada; so marca desconectado quando a Covercut responde que nao esta.
 */
async function checkCloudStatus(): Promise<number> {
  const inboxes = await prisma.inbox.findMany({
    where: { isActive: true, channelType: 'whatsapp_cloud' },
    select: { id: true, status: true, instanceName: true, channelConfig: true },
  })
  let changes = 0
  for (const inbox of inboxes) {
    const config = (inbox.channelConfig ?? {}) as Record<string, unknown>
    const phoneNumberId = typeof config.phoneNumberId === 'string' ? config.phoneNumberId : ''
    if (!phoneNumberId) continue
    try {
      const status = await getCovercutNumberStatus(phoneNumberId)
      const raw = (status.status || '').toUpperCase()
      const newStatus = raw === 'CONNECTED' || raw === 'ACTIVE' ? 'connected' : 'disconnected'
      if (newStatus !== inbox.status) {
        await prisma.inbox.update({
          where: { id: inbox.id },
          data: {
            status: newStatus,
            errorMessage: newStatus === 'connected' ? null : `WhatsApp Cloud: ${raw || 'sem status'}`,
            ...(newStatus === 'connected' ? { lastConnectedAt: new Date() } : {}),
          },
        })
        changes++
        console.log(`[Cron WhatsApp Status] ${inbox.instanceName}: ${inbox.status} -> ${newStatus}`)
      }
    } catch (err) {
      console.warn(`[Cron WhatsApp Status] Cloud ${inbox.instanceName} sem resposta:`, (err as Error)?.message)
    }
  }
  return changes
}

async function checkWhatsAppStatus() {
  await checkCloudStatus().catch((err) => console.error('[Cron WhatsApp Status] Cloud falhou:', err))

  // Daqui pra baixo e protocolo da UazAPI (/instance/status). Antes rodava em
  // TODAS as inboxes: numero oficial ou NotificaMe levava 401 e era marcado
  // como desconectado sem estar.
  const instances = await prisma.inbox.findMany({
    where: { isActive: true, channelType: 'uazapi' },
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
      if (!instance.instanceApiKey || !instance.apiUrl) {
        checked++
        continue
      }

      // UazAPI uses /instance/status endpoint
      const response = await fetch(`${instance.apiUrl}/instance/status`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'token': instance.instanceApiKey,
        },
        signal: AbortSignal.timeout(15000), // 15s timeout (UazAPI can be slow)
      })

      let newStatus: string
      let errorMessage: string | null = null

      if (!response.ok) {
        // 401/403 means token is invalid: mark disconnected
        if (response.status === 401 || response.status === 403) {
          newStatus = 'disconnected'
          errorMessage = 'Authentication failed'
        } else {
          // Other errors: keep current status, don't mark disconnected
          checked++
          continue
        }
      } else {
        const data = await response.json()

        // UazAPI returns status in multiple formats
        const hasStatusObject = typeof data.status === 'object' && data.status !== null
        const isLoggedIn = hasStatusObject ? data.status?.loggedIn === true : false
        const isConnected = hasStatusObject ? data.status?.connected === true : false
        const apiStatus = data.instance?.status || data.status

        if (isLoggedIn || isConnected) {
          newStatus = 'connected'
        } else if (apiStatus === 'connected' || apiStatus === 'open') {
          newStatus = 'connected'
        } else if (apiStatus === 'connecting' || apiStatus === 'qrcode' || apiStatus === 'SCANNING') {
          newStatus = 'connecting'
        } else {
          newStatus = 'disconnected'
          errorMessage = `Status: ${JSON.stringify(apiStatus)}`
        }
      }

      // Update only if status changed
      if (newStatus !== instance.status) {
        await prisma.inbox.update({
          where: { id: instance.id },
          data: {
            status: newStatus,
            errorMessage,
            ...(newStatus === 'connected' ? { qrCode: null, lastConnectedAt: new Date() } : {}),
          },
        })

        statusChanges++
        console.log(
          `[Cron WhatsApp Status] Instance ${instance.instanceName}: ${instance.status} → ${newStatus}`
        )
      }

      checked++
    } catch (err: any) {
      console.error(
        `[Cron WhatsApp Status] Error checking instance ${instance.instanceName || instance.id}:`,
        err.message
      )

      // IMPORTANT: Timeout/network errors do NOT mark as disconnected.
      // The instance may still be connected: only the status check failed.
      // Only mark disconnected after 3 consecutive failures.
      errors++
    }
  }

  if (statusChanges > 0 || errors > 0) {
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
