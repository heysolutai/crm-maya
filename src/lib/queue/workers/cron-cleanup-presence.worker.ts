import { Worker, Queue } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type CronTickJob } from '../queues'
import { prisma } from '@/lib/db'

async function cleanupPresence() {
  // Mark users as offline if last_seen_at > 3 minutes ago
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000)

  try {
    const result = await prisma.user.updateMany({
      where: {
        isOnline: true,
        lastSeenAt: { lt: threeMinutesAgo },
      },
      data: { isOnline: false },
    })

    const cleaned = result.count
    if (cleaned > 0) {
      console.log(`[Cron Cleanup Presence] Marked ${cleaned} users as offline`)
    }

    return { cleaned }
  } catch (error: any) {
    console.error('[Cron Cleanup Presence] Error:', error.message)
    return { cleaned: 0, error: error.message }
  }
}

let worker: Worker<CronTickJob> | null = null

export function startCleanupPresenceWorker() {
  if (worker) return worker

  const queue = new Queue<CronTickJob>(QUEUE_NAMES.CRON_CLEANUP_PRESENCE, {
    connection: getRedisConnection(),
  })

  // Run every 2 minutes
  queue.upsertJobScheduler(
    'cleanup-presence-scheduler',
    { every: 120000 },
    { name: 'cleanup-presence', data: { triggeredAt: new Date().toISOString() } }
  ).catch(err => console.error('[Cron Cleanup Presence] Failed to create scheduler:', err.message))

  worker = new Worker<CronTickJob>(
    QUEUE_NAMES.CRON_CLEANUP_PRESENCE,
    async () => {
      return cleanupPresence()
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[Cron Cleanup Presence] Job ${job?.id} failed:`, err.message)
  })

  console.log('[Cron Cleanup Presence] Worker started (every 2min)')
  return worker
}
