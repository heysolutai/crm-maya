import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { jsonResponse, errorResponse } from '@/lib/api/cors';

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized calls
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET;

    if (expectedSecret && cronSecret !== expectedSecret) {
      return errorResponse('Unauthorized', 401);
    }

    const supabase = createAdminClient();

    // Mark users as offline if last_seen_at > 3 minutes ago
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('users')
      .update({ is_online: false })
      .eq('is_online', true)
      .lt('last_seen_at', threeMinutesAgo)
      .select('id');

    if (error) {
      console.error('[Cleanup Presence] Error:', error);
      return errorResponse('Failed to cleanup stale presence');
    }

    const cleaned = data?.length || 0;
    if (cleaned > 0) {
      console.log(`[Cleanup Presence] Marked ${cleaned} users as offline (stale presence)`);
    }

    return jsonResponse({ success: true, cleaned });
  } catch (error: any) {
    console.error('[Cleanup Presence] Error:', error);
    return errorResponse(error.message || 'Internal server error');
  }
}
