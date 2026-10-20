import { Worker, Queue } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type CronTickJob } from '../queues'
import { isCovercutConfigured } from '@/lib/channels/covercut'
import { envAppBaseUrl, syncAllCloudNumbers } from '@/lib/channels/cloud-saas'

/**
 * WhatsApp Cloud: cria a caixa de entrada dos numeros que os restaurantes
 * conectaram pelo link da Covercut (sub-conta SaaS com external_id).
 *
 * O pop-up ja sincroniza na hora; isto cobre o link enviado pra outra pessoa
 * ou a janela fechada antes do aviso, sem depender do "Webhook de
 * Notificacao" da Covercut (que so se configura pelo painel, com secret).
 */

let avisouSemBaseUrl = false

async function syncCloudConnections() {
  if (!isCovercutConfigured()) return { skipped: 'covercut_off' }

  const base = envAppBaseUrl()
  if (!base) {
    if (!avisouSemBaseUrl) {
      console.warn('[Cron Cloud Connect] NEXT_PUBLIC_APP_URL/PUBLIC_APP_URL ausente: nao da pra registrar webhook')
      avisouSemBaseUrl = true
    }
    return { skipped: 'no_base_url' }
  }

  const result = await syncAllCloudNumbers(base)
  if (result.created.length > 0 || result.failed.length > 0) {
    console.log(
      `[Cron Cloud Connect] ${result.created.length} caixa(s) criada(s), ${result.failed.length} falha(s)`
    )
  }
  return { created: result.created.length, failed: result.failed.length }
}

let worker: Worker<CronTickJob> | null = null

export function startCloudConnectWorker() {
  if (worker) return worker

  const queue = new Queue<CronTickJob>(QUEUE_NAMES.CRON_CLOUD_CONNECT, {
    connection: getRedisConnection(),
  })

  queue.upsertJobScheduler(
    'cloud-connect-scheduler',
    { every: 120000 },
    { name: 'sync-cloud-connections', data: { triggeredAt: new Date().toISOString() } }
  ).catch(err => console.error('[Cron Cloud Connect] Failed to create scheduler:', err.message))

  worker = new Worker<CronTickJob>(
    QUEUE_NAMES.CRON_CLOUD_CONNECT,
    async () => syncCloudConnections(),
    {
      connection: getRedisConnection(),
      concurrency: 1,
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[Cron Cloud Connect] Job ${job?.id} failed:`, err.message)
  })

  console.log('[Cron Cloud Connect] Worker started (every 2min)')
  return worker
}
