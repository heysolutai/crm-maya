import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isInternalRequest, authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';

async function refreshAccessToken(supabase: any, connection: any): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: connection.refresh_token, grant_type: 'refresh_token' }),
    });
    if (!res.ok) { console.error(`[BulkSync] Token refresh failed for company ${connection.company_id}`); return null; }
    const data = await res.json();
    await supabase.from('google_calendar_connections').update({ access_token: data.access_token, token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString() }).eq('id', connection.id);
    return data.access_token;
  } catch { return null; }
}

async function getValidAccessToken(supabase: any, connection: any): Promise<string | null> {
  if (new Date(connection.token_expires_at).getTime() - Date.now() < 5 * 60 * 1000) return refreshAccessToken(supabase, connection);
  return connection.access_token;
}

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    // Bulk sync is a system-level operation — requires internal key, super_admin, or API key
    if (!isInternalRequest(req)) {
      const { agentId } = await authenticate(req);

      // If using Bearer token, verify super_admin role
      if (agentId) {
        const supabaseAuth = createAdminClient();
        const { data: role } = await supabaseAuth.from('user_roles').select('role').eq('user_id', agentId).eq('role', 'super_admin').maybeSingle();
        if (!role) return jsonResponse({ error: 'Forbidden: super_admin required' }, 403);
      }
      // API key auth is allowed (company-level access)
    }

    const supabase = createAdminClient();

    const { data: connections, error: connError } = await supabase
      .from('google_calendar_connections')
      .select('*, companies(name)')
      .eq('is_active', true)
      .eq('sync_enabled', true);

    if (connError || !connections?.length) {
      return jsonResponse({ message: 'No active connections found', error: connError });
    }

    console.log(`[BulkSync] Found ${connections.length} active connections`);
    const results: any[] = [];

    for (const connection of connections) {
      const companyName = connection.companies?.name || connection.company_id;
      console.log(`[BulkSync] Processing: ${companyName}`);

      const accessToken = await getValidAccessToken(supabase, connection);
      if (!accessToken) {
        results.push({ company: companyName, status: 'error', message: 'Token refresh failed' });
        continue;
      }

      const { data: appointments, error: aptError } = await supabase
        .from('appointments')
        .select('*, clients(first_name, last_name, phone, email)')
        .eq('company_id', connection.company_id)
        .is('google_event_id', null)
        .not('status', 'eq', 'cancelled')
        .order('scheduled_for', { ascending: true });

      if (aptError || !appointments?.length) {
        results.push({ company: companyName, status: 'ok', synced: 0, message: 'No pending appointments' });
        continue;
      }

      let synced = 0;
      let errors = 0;

      for (const appointment of appointments) {
        try {
          const startTime = new Date(appointment.scheduled_for);
          const endTime = new Date(startTime.getTime() + (appointment.duration_minutes || 60) * 60 * 1000);
          const clientName = appointment.clients ? `${appointment.clients.first_name} ${appointment.clients.last_name || ''}`.trim() : 'Cliente';

          const eventData: any = {
            summary: appointment.title || `Agendamento - ${clientName}`,
            description: [appointment.description || '', `Cliente: ${clientName}`, appointment.clients?.phone ? `Telefone: ${appointment.clients.phone}` : '', appointment.clients?.email ? `Email: ${appointment.clients.email}` : '', appointment.notes ? `\nNotas: ${appointment.notes}` : ''].filter(Boolean).join('\n'),
            start: { dateTime: startTime.toISOString(), timeZone: 'America/Sao_Paulo' },
            end: { dateTime: endTime.toISOString(), timeZone: 'America/Sao_Paulo' },
            location: appointment.location || undefined,
            reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
          };

          if (connection.create_meet_links) {
            eventData.conferenceData = { createRequest: { requestId: `meet-${appointment.id}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } };
          }

          const createUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendar_id)}/events`);
          if (connection.create_meet_links) createUrl.searchParams.set('conferenceDataVersion', '1');

          const createResponse = await fetch(createUrl.toString(), {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData),
          });

          if (createResponse.ok) {
            const createdEvent = await createResponse.json();
            const meetLink = createdEvent.conferenceData?.entryPoints?.[0]?.uri || null;
            const updateData: any = { google_event_id: createdEvent.id };
            if (meetLink) updateData.meeting_url = meetLink;
            await supabase.from('appointments').update(updateData).eq('id', appointment.id);
            synced++;
          } else {
            const errorText = await createResponse.text();
            console.error(`[BulkSync] Failed for apt ${appointment.id}: ${errorText}`);
            errors++;
          }

          // Rate limiting
          await new Promise(r => setTimeout(r, 200));
        } catch (e) {
          console.error(`[BulkSync] Error syncing apt ${appointment.id}:`, e);
          errors++;
        }
      }

      results.push({ company: companyName, status: 'ok', synced, errors, total: appointments.length });
      console.log(`[BulkSync] ${companyName}: synced ${synced}/${appointments.length} (${errors} errors)`);
    }

    return jsonResponse({ success: true, results });
  } catch (error: any) {
    console.error('[BulkSync] Fatal error:', error);
    return errorResponse(error.message);
  }
}
