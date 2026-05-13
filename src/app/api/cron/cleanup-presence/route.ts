import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'

function verifyCronSecret(req: NextRequest): boolean {
  // CLAUDE.md Rule 6: fail-closed — bloqueia se CRON_SECRET nao esta configurado
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

    // Mark users as offline if last_seen_at > 3 minutes ago
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);

    const result = await prisma.user.updateMany({
      where: {
        isOnline: true,
        lastSeenAt: { lt: threeMinutesAgo },
      },
      data: { isOnline: false },
    });

    const cleaned = result.count;
    if (cleaned > 0) {
      console.log(`[Cleanup Presence] Marked ${cleaned} users as offline (stale presence)`);
    }

    return jsonResponse({ success: true, cleaned });
  } catch (error) {
    return handleApiErrorCors(error, '[Cleanup Presence] Error')
  }
}
