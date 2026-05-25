import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type InboundMessageJob } from '../queues'

let worker: Worker | null = null

export function startInboundMessageWorker() {
  if (worker) return

  worker = new Worker<InboundMessageJob>(
    QUEUE_NAMES.INBOUND_MESSAGE,
    async (job: Job<InboundMessageJob>) => {
      const { rawPayload, agentId } = job.data

      // Dynamic import to avoid circular dependencies and keep worker lightweight
      const { processInboundMessageFromQueue } = await import(
        '@/app/api/webhooks/whatsapp/process-message'
      )

      await processInboundMessageFromQueue(rawPayload, agentId)
    },
    {
      connection: getRedisConnection(),
      concurrency: 20, // Process 20 messages in parallel (tuned for DB pool of 50)
      limiter: {
        max: 200,
        duration: 1000, // 200 messages/sec max throughput
      },
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[Inbound Worker] Job ${job?.id} failed:`, err.message)
  })

  worker.on('error', (err) => {
    console.error('[Inbound Worker] Worker error:', err)
  })

  console.log('[Queue] Inbound message worker started (concurrency: 20, limit: 200/sec)')
}
