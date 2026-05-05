import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'

export async function POST(req: NextRequest) {
  try {
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET;

    if (expectedSecret && cronSecret !== expectedSecret) {
      return errorResponse('Unauthorized', 401);
    }

    // Import dynamically to avoid issues on edge
    const { Queue } = await import('bullmq');
    const { getRedisConnection } = await import('@/lib/queue/connection');
    const { QUEUE_NAMES } = await import('@/lib/queue/queues');

    const queue = new Queue(QUEUE_NAMES.CRON_REMINDERS, {
      connection: getRedisConnection(),
    });

    const job = await queue.add('manual-trigger', {
      triggeredAt: new Date().toISOString(),
    });

    return jsonResponse({ success: true, jobId: job.id, message: 'Reminders processing triggered' });
  } catch (error) {
    return handleApiErrorCors(error, '[API Cron] process-reminders error')
  }
}
