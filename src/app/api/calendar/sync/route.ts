import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate, isInternalRequest } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, unauthorizedResponse, badRequestResponse, notFoundResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'

async function refreshAccessToken(connection: any): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId || '', client_secret: clientSecret || '', refresh_token: connection.refreshToken || '', grant_type: 'refresh_token' }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    await prisma.googleCalendarConnection.update({
      where: { id: connection.id },
      data: { accessToken: data.access_token, tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000) },
    });
    return data.access_token;
  } catch { return null; }
}

async function getValidToken(connection: any): Promise<string | null> {
  if (new Date(connection.tokenExpiresAt).getTime() - Date.now() < 5 * 60 * 1000) return refreshAccessToken(connection);
  return connection.accessToken;
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

    const { action, appointment_id, company_id } = await req.json();
    if (!action || !appointment_id || !company_id) return badRequestResponse('Missing required fields');

    const connection = await prisma.googleCalendarConnection.findFirst({
      where: { companyId: company_id, isActive: true },
    });
    if (!connection) return jsonResponse({ success: false, message: 'No Google Calendar connected' });
    if (!connection.syncEnabled) return jsonResponse({ success: false, message: 'Sync disabled' });

    const accessToken = await getValidToken(connection);
    if (!accessToken) return errorResponse('Failed to get valid access token');

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointment_id },
      include: { client: { select: { firstName: true, lastName: true, phone: true, email: true } } },
    });
    if (!appointment) return notFoundResponse('Appointment not found');

    const calendarId = connection.calendarId || '';

    if (action === 'delete') {
      if (appointment.googleEventId) {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${appointment.googleEventId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
        await prisma.appointment.update({ where: { id: appointment_id }, data: { googleEventId: null } });
      }
      return jsonResponse({ success: true, action: 'deleted' });
    }

    const startTime = new Date(appointment.scheduledFor);
    const endTime = new Date(startTime.getTime() + (appointment.durationMinutes || 60) * 60 * 1000);
    const clientName = appointment.client ? `${appointment.client.firstName} ${appointment.client.lastName || ''}`.trim() : 'Cliente';

    const eventData: any = {
      summary: appointment.title || `Agendamento - ${clientName}`,
      description: [appointment.description || '', `Cliente: ${clientName}`, appointment.client?.phone ? `Telefone: ${appointment.client.phone}` : '', appointment.client?.email ? `Email: ${appointment.client.email}` : '', appointment.notes ? `\nNotas: ${appointment.notes}` : ''].filter(Boolean).join('\n'),
      start: { dateTime: startTime.toISOString(), timeZone: 'America/Sao_Paulo' },
      end: { dateTime: endTime.toISOString(), timeZone: 'America/Sao_Paulo' },
      location: appointment.location || undefined,
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }, { method: 'popup', minutes: 60 }] },
    };

    if (connection.createMeetLinks) {
      eventData.conferenceData = { createRequest: { requestId: `meet-${appointment_id}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } };
    }

    let eventId = appointment.googleEventId;

    if (action === 'create' || !eventId) {
      const createUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
      if (connection.createMeetLinks) createUrl.searchParams.set('conferenceDataVersion', '1');
      const res = await fetch(createUrl.toString(), { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(eventData) });
      if (!res.ok) return errorResponse('Failed to create calendar event');
      const created = await res.json();
      eventId = created.id;
      const meetLink = created.conferenceData?.entryPoints?.[0]?.uri || null;
      const update: any = { googleEventId: eventId };
      if (meetLink) update.meetingUrl = meetLink;
      await prisma.appointment.update({ where: { id: appointment_id }, data: update });
      return jsonResponse({ success: true, action: 'created', event_id: eventId, meet_link: meetLink });
    } else {
      const updateUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`);
      if (connection.createMeetLinks) updateUrl.searchParams.set('conferenceDataVersion', '1');
      const res = await fetch(updateUrl.toString(), { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(eventData) });
      if (!res.ok && res.status === 404) {
        // Event not found, create new
        return POST(new NextRequest(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify({ action: 'create', appointment_id, company_id }) }));
      }
      if (!res.ok) return errorResponse('Failed to update calendar event');
      return jsonResponse({ success: true, action: 'updated', event_id: eventId });
    }
  } catch (error) {
    return handleApiErrorCors(error, '[Calendar Sync]')
  }
}
