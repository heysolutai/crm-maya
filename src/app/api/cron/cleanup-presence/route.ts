import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api/cors';

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized calls
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET;

    if (expectedSecret && cronSecret !== expectedSecret) {
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
    console.error('[Cleanup Presence] Error:', error);
    return errorResponse('Erro interno do servidor');
  }
}
