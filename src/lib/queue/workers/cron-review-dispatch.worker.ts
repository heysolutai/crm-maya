import { Worker, Queue } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type CronTickJob } from '../queues'
import { prisma } from '@/lib/db'
import { getSystemSetting } from '@/lib/system-settings'
import { getDecryptedApiKey } from '@/lib/api/api-key-utils'

/**
 * Cron diaria que avisa o n8n sobre os restaurantes com avaliacao ativa.
 *
 * Pra cada restaurante que se qualifica, dispara UM POST pro n8n com:
 *   { apikey, restaurant_id, company_id }
 * O resto (quem avaliar, quando, o que enviar) fica por conta do fluxo do n8n,
 * que usa a apikey pra chamar de volta /api/evaluation-config, /api/reviews etc.
 *
 * Qualificacao (as duas condicoes):
 *   1. Modulo de avaliacao ativo (ReviewSettings.enabled = true)
 *   2. Inbox ativo com restaurant_id preenchido (channelConfig.restaurantId)
 */
async function dispatchReviewCron() {
  const now = new Date()
  console.log(
    `[Cron Review] Disparo iniciado — ${now.toISOString()} (UTC) | ` +
    `${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (BRT)`
  )

  // URL do webhook do n8n — system setting tem prioridade, com fallback pro env.
  const webhookUrl =
    (await getSystemSetting('n8n_review_webhook_url')) ||
    process.env.N8N_REVIEW_WEBHOOK_URL

  if (!webhookUrl) {
    console.log('[Cron Review] n8n_review_webhook_url nao configurado — pulando')
    return { sent: 0, skipped: 0, failed: 0 }
  }

  // 1. Empresas com o modulo de avaliacao ativo.
  const activeSettings = await prisma.reviewSettings.findMany({
    where: { enabled: true },
    select: { companyId: true },
  })
  const activeCompanyIds = activeSettings.map((s) => s.companyId)
  if (activeCompanyIds.length === 0) {
    return { sent: 0, skipped: 0, failed: 0 }
  }

  // 2. Inboxes ativos dessas empresas. O restaurant_id vive no channelConfig
  //    (JSON), entao filtramos a presenca dele em JS.
  const inboxes = await prisma.inbox.findMany({
    where: { isActive: true, companyId: { in: activeCompanyIds } },
    select: { id: true, companyId: true, channelConfig: true },
  })

  let sent = 0
  let skipped = 0
  let failed = 0

  // Cache da apikey por empresa — evita descriptografar a mesma chave N vezes.
  const keyCache = new Map<string, string | null>()

  for (const inbox of inboxes) {
    const restaurantId = (inbox.channelConfig as Record<string, unknown> | null)?.restaurantId
    if (typeof restaurantId !== 'string' || !restaurantId.trim()) {
      skipped++
      continue
    }

    let apikey = keyCache.get(inbox.companyId)
    if (apikey === undefined) {
      apikey = await getDecryptedApiKey(inbox.companyId)
      keyCache.set(inbox.companyId, apikey)
    }
    if (!apikey) {
      console.warn(`[Cron Review] Empresa ${inbox.companyId} sem API key ativa — pulando restaurante ${restaurantId}`)
      skipped++
      continue
    }

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apikey,
          restaurant_id: restaurantId,
          company_id: inbox.companyId,
        }),
        signal: AbortSignal.timeout(30_000),
      })
      if (res.ok) {
        sent++
      } else {
        failed++
        console.warn(`[Cron Review] n8n respondeu ${res.status} pro restaurante ${restaurantId}`)
      }
    } catch (err) {
      failed++
      console.error(`[Cron Review] Falha ao enviar restaurante ${restaurantId}:`, (err as Error).message)
    }
  }

  console.log(`[Cron Review] Concluido: ${sent} enviados, ${skipped} pulados, ${failed} falhas`)
  return { sent, skipped, failed }
}

let worker: Worker<CronTickJob> | null = null

export function startReviewDispatchWorker() {
  if (worker) return worker

  const queue = new Queue<CronTickJob>(QUEUE_NAMES.CRON_REVIEW_DISPATCH, {
    connection: getRedisConnection(),
  })

  // 1x por dia. Pattern e timezone configuraveis por env; default 09:00 BRT.
  const pattern = process.env.REVIEW_DISPATCH_CRON || '0 9 * * *'
  const tz = process.env.REVIEW_DISPATCH_TZ || 'America/Sao_Paulo'
  queue
    .upsertJobScheduler(
      'review-dispatch-scheduler',
      { pattern, tz },
      { name: 'dispatch-reviews', data: { triggeredAt: new Date().toISOString() } }
    )
    .then(() => console.log(`[Cron Review] Scheduler criado — pattern='${pattern}' tz='${tz}'`))
    .catch((err) => console.error('[Cron Review] Falha ao criar scheduler:', err.message))

  worker = new Worker<CronTickJob>(
    QUEUE_NAMES.CRON_REVIEW_DISPATCH,
    async () => dispatchReviewCron(),
    { connection: getRedisConnection(), concurrency: 1 }
  )

  worker.on('failed', (job, err) => {
    console.error(`[Cron Review] Job ${job?.id} falhou:`, err.message)
  })

  console.log('[Cron Review] Worker iniciado (1x/dia)')
  return worker
}

export async function stopReviewDispatchWorker() {
  if (worker) {
    await worker.close()
    worker = null
  }
}
