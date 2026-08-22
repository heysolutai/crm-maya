import { prisma } from '@/lib/db'
import { getSystemSetting } from '@/lib/system-settings'
import { getDecryptedApiKey } from '@/lib/api/api-key-utils'

/**
 * Logica compartilhada do disparo de avaliacao pro n8n.
 * Usada pela cron horaria (worker) e pelo disparo manual (API).
 */

export interface DispatchResult {
  sent: number
  skipped: number
  failed: number
}

/** URL do webhook do n8n — system setting tem prioridade, com fallback pro env. */
export async function getReviewWebhookUrl(): Promise<string | null> {
  return (
    (await getSystemSetting('n8n_review_webhook_url')) ||
    process.env.N8N_REVIEW_WEBHOOK_URL ||
    null
  )
}

/**
 * Dispara UM POST pro n8n por inbox ativo da empresa que tenha restaurant_id
 * no channelConfig. O payload e { apikey, restaurant_id, company_id }; o resto
 * (quem avaliar, quando, o que enviar) fica por conta do fluxo do n8n.
 */
export async function dispatchCompanyReviews(
  companyId: string,
  webhookUrl: string
): Promise<DispatchResult> {
  const inboxes = await prisma.inbox.findMany({
    where: { isActive: true, companyId },
    select: { id: true, channelConfig: true },
  })

  let sent = 0
  let skipped = 0
  let failed = 0

  // Descriptografa a apikey uma vez so, na primeira necessidade.
  let apikey: string | null | undefined

  for (const inbox of inboxes) {
    const restaurantId = (inbox.channelConfig as Record<string, unknown> | null)?.restaurantId
    if (typeof restaurantId !== 'string' || !restaurantId.trim()) {
      skipped++
      continue
    }

    if (apikey === undefined) {
      apikey = await getDecryptedApiKey(companyId)
    }
    if (!apikey) {
      console.warn(`[Review Dispatch] Empresa ${companyId} sem API key ativa — pulando restaurante ${restaurantId}`)
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
          company_id: companyId,
        }),
        signal: AbortSignal.timeout(30_000),
      })
      if (res.ok) {
        sent++
      } else {
        failed++
        console.warn(`[Review Dispatch] n8n respondeu ${res.status} pro restaurante ${restaurantId}`)
      }
    } catch (err) {
      failed++
      console.error(`[Review Dispatch] Falha ao enviar restaurante ${restaurantId}:`, (err as Error).message)
    }
  }

  return { sent, skipped, failed }
}
