import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate, isInternalRequest } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();
    const { action, user_id } = body;

    if (!action || !user_id) return badRequestResponse('action and user_id are required');

    const now = new Date().toISOString();

    if (action === 'online') {
      await supabase
        .from('users')
        .update({ is_online: true, last_seen_at: now })
        .eq('id', user_id);

      return jsonResponse({ success: true, status: 'online' });
    }

    if (action === 'offline') {
      await supabase
        .from('users')
        .update({ is_online: false, last_seen_at: now })
        .eq('id', user_id);

      return jsonResponse({ success: true, status: 'offline' });
    }

    if (action === 'heartbeat') {
      await supabase
        .from('users')
        .update({ last_seen_at: now })
        .eq('id', user_id);

      return jsonResponse({ success: true, status: 'heartbeat' });
    }

    return badRequestResponse('Invalid action. Use: online, offline, or heartbeat');
  } catch (error: any) {
    console.error('[Presence] Error:', error);
    return errorResponse(error.message || 'Internal server error');
  }
}
