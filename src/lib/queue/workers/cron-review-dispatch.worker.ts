import { Worker, Queue } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type CronTickJob } from '../queues'
import { prisma } from '@/lib/db'
import { dispatchCompanyReviews, getReviewWebhookUrl } from '@/lib/reviews/dispatch'

const DISPATCH_TZ = process.env.REVIEW_DISPATCH_TZ || 'America/Sao_Paulo'

/** Hora atual (0-23) no fuso do disparo. */
function currentHourInTz(date: Date): number {
  const hourPart = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPATCH_TZ,
    hour: 'numeric',
    hourCycle: 'h23',
  })
    .formatToParts(date)
    .find((p) => p.type === 'hour')
  return parseInt(hourPart?.value ?? '0', 10)
}

/**
 * Cron horaria que avisa o n8n sobre os restaurantes com avaliacao ativa.
 *
 * O tick roda de hora em hora, mas cada empresa e disparada UMA vez por dia,
 * na hora que ela configurou (ReviewSettings.dispatchHour, fuso BRT).
 *
 * Pra cada restaurante que se qualifica, dispara UM POST pro n8n com:
 *   { apikey, restaurant_id, company_id }
 * O resto (quem avaliar, quando, o que enviar) fica por conta do fluxo do n8n,
 * que usa a apikey pra chamar de volta /api/evaluation-config, /api/reviews etc.
 *
 * Qualificacao (as tres condicoes):
 *   1. Modulo de avaliacao ativo (ReviewSettings.enabled = true)
 *   2. dispatchHour da empresa igual a hora atual (BRT)
 *   3. Inbox ativo com restaurant_id preenchido (channelConfig.restaurantId)
 */
async function dispatchReviewCron() {
  const now = new Date()
  const currentHour = currentHourInTz(now)
  console.log(
    `[Cron Review] Tick — ${now.toISOString()} (UTC) | ` +
    `${now.toLocaleString('pt-BR', { timeZone: DISPATCH_TZ })} (${DISPATCH_TZ}, hora ${currentHour})`
  )

  const webhookUrl = await getReviewWebhookUrl()
  if (!webhookUrl) {
    console.log('[Cron Review] n8n_review_webhook_url nao configurado — pulando')
    return { sent: 0, skipped: 0, failed: 0 }
  }

  // Empresas com o modulo ativo E cujo horario configurado e a hora atual.
  const activeSettings = await prisma.reviewSettings.findMany({
    where: { enabled: true, dispatchHour: currentHour },
    select: { companyId: true },
  })
  if (activeSettings.length === 0) {
    return { sent: 0, skipped: 0, failed: 0 }
  }

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const { companyId } of activeSettings) {
    const result = await dispatchCompanyReviews(companyId, webhookUrl)
    sent += result.sent
    skipped += result.skipped
    failed += result.failed
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

  // Tick de hora em hora (minuto 0). O filtro por empresa acontece dentro do
  // job, comparando ReviewSettings.dispatchHour com a hora atual no fuso.
  const pattern = process.env.REVIEW_DISPATCH_CRON || '0 * * * *'
  queue
    .upsertJobScheduler(
      'review-dispatch-scheduler',
      { pattern, tz: DISPATCH_TZ },
      { name: 'dispatch-reviews', data: { triggeredAt: new Date().toISOString() } }
    )
    .then(() => console.log(`[Cron Review] Scheduler criado — pattern='${pattern}' tz='${DISPATCH_TZ}'`))
    .catch((err) => console.error('[Cron Review] Falha ao criar scheduler:', err.message))

  worker = new Worker<CronTickJob>(
    QUEUE_NAMES.CRON_REVIEW_DISPATCH,
    async () => dispatchReviewCron(),
    { connection: getRedisConnection(), concurrency: 1 }
  )

  worker.on('failed', (job, err) => {
    console.error(`[Cron Review] Job ${job?.id} falhou:`, err.message)
  })

  console.log('[Cron Review] Worker iniciado (tick horario, horario por empresa)')
  return worker
}

export async function stopReviewDispatchWorker() {
  if (worker) {
    await worker.close()
    worker = null
  }
}
