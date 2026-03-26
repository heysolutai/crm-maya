import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, notFoundResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req);
    const supabase = createAdminClient();

    const { data: connection } = await supabase.from('google_calendar_connections').select('*').eq('company_id', companyId).single();
    if (!connection) return notFoundResponse('No Google Calendar connected');

    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${connection.access_token}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    } catch (e) { console.warn('[Disconnect] Token revoke failed:', e); }

    const { error: deleteError } = await supabase.from('google_calendar_connections').delete().eq('company_id', companyId);
    if (deleteError) return errorResponse('Failed to disconnect');

    return jsonResponse({ success: true });
  } catch (error: any) {
    return errorResponse(error.message);
  }
}
