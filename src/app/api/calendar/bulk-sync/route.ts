import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { isInternalRequest, authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';

async function refreshAccessToken(connection: any): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId || '', client_secret: clientSecret || '', refresh_token: connection.refreshToken || '', grant_type: 'refresh_token' }),
    });
    if (!res.ok) { console.error(`[BulkSync] Token refresh failed for company ${connection.companyId}`); return null; }
    const data = await res.json();
    await prisma.googleCalendarConnection.update({
      where: { id: connection.id },
      data: { accessToken: data.access_token, tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000) },
    });
    return data.access_token;
  } catch { return null; }
}

async function getValidAccessToken(connection: any): Promise<string | null> {
  if (new Date(connection.tokenExpiresAt).getTime() - Date.now() < 5 * 60 * 1000) return refreshAccessToken(connection);
  return connection.accessToken;
}

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    // Bulk sync is a system-level operation — requires internal key, super_admin, or API key
    if (!isInternalRequest(req)) {
      const { agentId } = await authenticate(req);

      // If using Bearer token, verify super_admin role
      if (agentId) {
        const role = await prisma.userRole.findFirst({
          where: { userId: agentId, role: 'super_admin' },
        });
        if (!role) return jsonResponse({ error: 'Forbidden: super_admin required' }, 403);
      }
      // API key auth is allowed (company-level access)
    }

    const connections = await prisma.googleCalendarConnection.findMany({
      where: { isActive: true, syncEnabled: true },
      include: { company: { select: { name: true } } },
    });

    if (!connections?.length) {
      return jsonResponse({ message: 'No active connections found' });
    }

    console.log(`[BulkSync] Found ${connections.length} active connections`);
    const results: any[] = [];

    for (const connection of connections) {
      const companyName = connection.company?.name || connection.companyId;
      console.log(`[BulkSync] Processing: ${companyName}`);

      const accessToken = await getValidAccessToken(connection);
      if (!accessToken) {
        results.push({ company: companyName, status: 'error', message: 'Token refresh failed' });
        continue;
      }

      const appointments = await prisma.appointment.findMany({
        where: {
          companyId: connection.companyId,
          googleEventId: null,
          status: { not: 'cancelled' },
        },
        include: { client: { select: { firstName: true, lastName: true, phone: true, email: true } } },
        orderBy: { scheduledFor: 'asc' },
      });

      if (!appointments?.length) {
        results.push({ company: companyName, status: 'ok', synced: 0, message: 'No pending appointments' });
        continue;
      }

      let synced = 0;
      let errors = 0;

      for (const appointment of appointments) {
        try {
          const startTime = new Date(appointment.scheduledFor);
          const endTime = new Date(startTime.getTime() + (appointment.durationMinutes || 60) * 60 * 1000);
          const clientName = appointment.client ? `${appointment.client.firstName} ${appointment.client.lastName || ''}`.trim() : 'Cliente';

          const eventData: any = {
            summary: appointment.title || `Agendamento - ${clientName}`,
            description: [appointment.description || '', `Cliente: ${clientName}`, appointment.client?.phone ? `Telefone: ${appointment.client.phone}` : '', appointment.client?.email ? `Email: ${appointment.client.email}` : '', appointment.notes ? `\nNotas: ${appointment.notes}` : ''].filter(Boolean).join('\n'),
            start: { dateTime: startTime.toISOString(), timeZone: 'America/Sao_Paulo' },
            end: { dateTime: endTime.toISOString(), timeZone: 'America/Sao_Paulo' },
            location: appointment.location || undefined,
            reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
          };

          if (connection.createMeetLinks) {
            eventData.conferenceData = { createRequest: { requestId: `meet-${appointment.id}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } };
          }

          const createUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId || '')}/events`);
          if (connection.createMeetLinks) createUrl.searchParams.set('conferenceDataVersion', '1');

          const createResponse = await fetch(createUrl.toString(), {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData),
          });

          if (createResponse.ok) {
            const createdEvent = await createResponse.json();
            const meetLink = createdEvent.conferenceData?.entryPoints?.[0]?.uri || null;
            const updateData: any = { googleEventId: createdEvent.id };
            if (meetLink) updateData.meetingUrl = meetLink;
            await prisma.appointment.update({ where: { id: appointment.id }, data: updateData });
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
  } catch (error) {
    console.error('[BulkSync] Fatal error:', error);
    return errorResponse('Erro interno do servidor');
  }
}
