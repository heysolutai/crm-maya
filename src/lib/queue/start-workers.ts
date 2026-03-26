import { startN8NWebhookWorker } from './workers/n8n-webhook.worker'
import { startTranscriptionWorker } from './workers/transcription.worker'
import { startMediaProcessingWorker } from './workers/media-processing.worker'
import { startOutboundMessageWorker } from './workers/outbound-message.worker'

let workersStarted = false

/**
 * Start all BullMQ workers.
 * Called once on server startup via instrumentation.ts.
 * Workers run in the same Node.js process as Next.js (standalone mode).
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

  startN8NWebhookWorker()
  startTranscriptionWorker()
  startMediaProcessingWorker()
  startOutboundMessageWorker()

  workersStarted = true
  console.log('[Queue] All workers started successfully')
}
