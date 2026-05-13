import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { jsonResponse, errorResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'

function verifyCronSecret(req: NextRequest): boolean {
  // CLAUDE.md Rule 6: fail-closed
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return false;
  const cronSecret = req.headers.get('x-cron-secret');
  if (!cronSecret) return false;
  const a = Buffer.from(cronSecret);
  const b = Buffer.from(expectedSecret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyCronSecret(req)) {
      return errorResponse('Unauthorized', 401);
    }

    const { Queue } = await import('bullmq');
    const { getRedisConnection } = await import('@/lib/queue/connection');
    const { QUEUE_NAMES } = await import('@/lib/queue/queues');

    const queue = new Queue(QUEUE_NAMES.CRON_WHATSAPP_STATUS, {
      connection: getRedisConnection(),
    });

    const job = await queue.add('manual-trigger', {
      triggeredAt: new Date().toISOString(),
    });

    return jsonResponse({ success: true, jobId: job.id, message: 'WhatsApp status check triggered' });
  } catch (error) {
    return handleApiErrorCors(error, '[API Cron] whatsapp-status error')
  }
}
