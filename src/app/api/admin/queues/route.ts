import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import {
  getN8NQueue,
  getTranscriptionQueue,
  getMediaQueue,
  getOutboundMessageQueue,
  getOutboundMediaQueue,
  QUEUE_NAMES,
} from '@/lib/queue/queues'

// Simple queue status API for monitoring
// Protected by super_admin check
export async function GET(request: NextRequest) {
  // Check if Redis is configured
  if (!process.env.REDIS_URL) {
    return NextResponse.json(
      { error: 'Queue system not configured (REDIS_URL not set)' },
      { status: 503 }
    )
  }

  try {
    const { agentId } = await authenticate(request)

    if (!agentId) {
      return NextResponse.json({ error: 'Super admin authentication required (Bearer token)' }, { status: 403 })
    }

    // Check super_admin role
    const superAdminRole = await prisma.userRole.findFirst({
      where: { userId: agentId, role: 'super_admin' },
    })

    if (!superAdminRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get queue stats
    const queues = [
      { name: QUEUE_NAMES.N8N_WEBHOOK, queue: getN8NQueue() },
      { name: QUEUE_NAMES.TRANSCRIPTION, queue: getTranscriptionQueue() },
      { name: QUEUE_NAMES.MEDIA_PROCESSING, queue: getMediaQueue() },
      { name: QUEUE_NAMES.OUTBOUND_MESSAGE, queue: getOutboundMessageQueue() },
      { name: QUEUE_NAMES.OUTBOUND_MEDIA, queue: getOutboundMediaQueue() },
    ]

    const stats = await Promise.all(
      queues.map(async ({ name, queue }) => {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ])

        return {
          name,
          waiting,
          active,
          completed,
          failed,
          delayed,
          total: waiting + active + delayed,
        }
      })
    )

    return NextResponse.json({
      status: 'ok',
      queues: stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Queue API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get queue stats' },
      { status: 500 }
    )
  }
}
