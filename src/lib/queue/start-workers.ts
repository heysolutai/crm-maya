import { startInboundMessageWorker } from './workers/inbound-message.worker'
import { startN8NWebhookWorker } from './workers/n8n-webhook.worker'
import { startTranscriptionWorker } from './workers/transcription.worker'
import { startMediaProcessingWorker } from './workers/media-processing.worker'
import { startOutboundMessageWorker } from './workers/outbound-message.worker'
import { startCampaignTickWorker } from './workers/campaign-tick.worker'
import { startRemindersWorker } from './workers/cron-reminders.worker'
import { startFollowUpsWorker } from './workers/cron-follow-ups.worker'
import { startWhatsAppStatusWorker } from './workers/cron-whatsapp-status.worker'
import { startCleanupPresenceWorker } from './workers/cron-cleanup-presence.worker'

let workersStarted = false

/**
 * Start all BullMQ workers.
 * Called once on server startup via instrumentation.ts.
 * Workers run in the same Node.js process as Next.js (standalone mode).
 *
 * Includes cron workers that replace Supabase Edge Functions:
 * - Reminders: processes pending reminders every 60s
 * - Follow-ups: processes pending follow-up jobs every 60s
 * - WhatsApp Status: checks instance connectivity every 5min
 * - Cleanup Presence: marks stale users as offline every 2min
 */
export function startAllWorkers() {
  if (workersStarted) {
    console.log('[Queue] Workers already started, skipping')
    return
  }

  // Only start workers on the server side
  if (typeof window !== 'undefined') {
    return
  }

  // Only start if Redis is configured
  if (!process.env.REDIS_URL) {
    console.log('[Queue] REDIS_URL not set, queue workers disabled')
    return
  }

  console.log('[Queue] Starting all workers...')

  // Message processing workers
  startInboundMessageWorker()
  startN8NWebhookWorker()
  startTranscriptionWorker()
  startMediaProcessingWorker()
  startOutboundMessageWorker()

  // Campanhas — disparo em massa com rate limit/janela horaria
  startCampaignTickWorker()

  // Cron workers (replace Edge Functions + pg_cron)
  startRemindersWorker()
  startFollowUpsWorker()
  startWhatsAppStatusWorker()
  startCleanupPresenceWorker()

  workersStarted = true
  console.log('[Queue] All workers started successfully (including cron jobs)')
}
