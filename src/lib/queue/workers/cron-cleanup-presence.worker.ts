import { Worker, Queue } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type CronTickJob } from '../queues'
import { createAdminClient } from '@/lib/supabase/admin'

async function cleanupPresence() {
  const supabase = createAdminClient()

  // Mark users as offline if last_seen_at > 3 minutes ago
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('users')
    .update({ is_online: false })
    .eq('is_online', true)
    .lt('last_seen_at', threeMinutesAgo)
    .select('id')

  if (error) {
    console.error('[Cron Cleanup Presence] Error:', error.message)
    return { cleaned: 0, error: error.message }
  }

  const cleaned = data?.length || 0
  if (cleaned > 0) {
    console.log(`[Cron Cleanup Presence] Marked ${cleaned} users as offline`)
  }

  return { cleaned }
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
