import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate, isInternalRequest } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, unauthorizedResponse, badRequestResponse, notFoundResponse } from '@/lib/api/cors';

async function refreshAccessToken(supabase: any, connection: any): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: connection.refresh_token, grant_type: 'refresh_token' }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    await supabase.from('google_calendar_connections').update({ access_token: data.access_token, token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString() }).eq('id', connection.id);
    return data.access_token;
  } catch { return null; }
}

async function getValidToken(supabase: any, connection: any): Promise<string | null> {
  if (new Date(connection.token_expires_at).getTime() - Date.now() < 5 * 60 * 1000) return refreshAccessToken(supabase, connection);
  return connection.access_token;
}

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    // Accept internal service calls (from syncWithGoogleCalendar) or authenticated requests
    if (!isInternalRequest(req)) {
      try {
        const authResult = await authenticate(req);
        const body = await req.clone().json();
        if (body.company_id && body.company_id !== authResult.companyId) {
          return jsonResponse({ error: 'Forbidden: company_id mismatch' }, 403);
        }
      } catch {
        return unauthorizedResponse('Authentication required');
      }
    }

    const supabase = createAdminClient();
    const { action, appointment_id, company_id } = await req.json();
    if (!action || !appointment_id || !company_id) return badRequestResponse('Missing required fields');

    const { data: connection } = await supabase.from('google_calendar_connections').select('*').eq('company_id', company_id).eq('is_active', true).single();
    if (!connection) return jsonResponse({ success: false, message: 'No Google Calendar connected' });
    if (!connection.sync_enabled) return jsonResponse({ success: false, message: 'Sync disabled' });

    const accessToken = await getValidToken(supabase, connection);
    if (!accessToken) return errorResponse('Failed to get valid access token');

    const { data: appointment } = await supabase.from('appointments').select('*, clients(first_name, last_name, phone, email)').eq('id', appointment_id).single();
    if (!appointment) return notFoundResponse('Appointment not found');

    const calendarId = connection.calendar_id;

    if (action === 'delete') {
      if (appointment.google_event_id) {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${appointment.google_event_id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
        await supabase.from('appointments').update({ google_event_id: null }).eq('id', appointment_id);
      }
      return jsonResponse({ success: true, action: 'deleted' });
    }

    const startTime = new Date(appointment.scheduled_for);
    const endTime = new Date(startTime.getTime() + (appointment.duration_minutes || 60) * 60 * 1000);
    const clientName = appointment.clients ? `${appointment.clients.first_name} ${appointment.clients.last_name || ''}`.trim() : 'Cliente';

    const eventData: any = {
      summary: appointment.title || `Agendamento - ${clientName}`,
      description: [appointment.description || '', `Cliente: ${clientName}`, appointment.clients?.phone ? `Telefone: ${appointment.clients.phone}` : '', appointment.clients?.email ? `Email: ${appointment.clients.email}` : '', appointment.notes ? `\nNotas: ${appointment.notes}` : ''].filter(Boolean).join('\n'),
      start: { dateTime: startTime.toISOString(), timeZone: 'America/Sao_Paulo' },
      end: { dateTime: endTime.toISOString(), timeZone: 'America/Sao_Paulo' },
      location: appointment.location || undefined,
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }, { method: 'popup', minutes: 60 }] },
    };

    if (connection.create_meet_links) {
      eventData.conferenceData = { createRequest: { requestId: `meet-${appointment_id}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } };
    }

    let eventId = appointment.google_event_id;

    if (action === 'create' || !eventId) {
      const createUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
      if (connection.create_meet_links) createUrl.searchParams.set('conferenceDataVersion', '1');
      const res = await fetch(createUrl.toString(), { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(eventData) });
      if (!res.ok) return errorResponse('Failed to create calendar event');
      const created = await res.json();
      eventId = created.id;
      const meetLink = created.conferenceData?.entryPoints?.[0]?.uri || null;
      const update: any = { google_event_id: eventId };
      if (meetLink) update.meeting_url = meetLink;
      await supabase.from('appointments').update(update).eq('id', appointment_id);
      return jsonResponse({ success: true, action: 'created', event_id: eventId, meet_link: meetLink });
    } else {
      const updateUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`);
      if (connection.create_meet_links) updateUrl.searchParams.set('conferenceDataVersion', '1');
      const res = await fetch(updateUrl.toString(), { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(eventData) });
      if (!res.ok && res.status === 404) {
        // Event not found, create new
        return POST(new NextRequest(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify({ action: 'create', appointment_id, company_id }) }));
      }
      if (!res.ok) return errorResponse('Failed to update calendar event');
      return jsonResponse({ success: true, action: 'updated', event_id: eventId });
    }
  } catch (error: any) {
    console.error('[Calendar Sync]', error);
    return errorResponse(error.message);
  }
}
