import { NextRequest } from 'next/server';
import { handleCors, jsonResponse } from '@/lib/api/cors';
import {
  apiError, apiSuccess, formatWithBrazilOffset, defaultBusinessHours,
  getEffectiveAppointmentSettings, authenticateApiKey,
} from '@/lib/api/appointments-helpers';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateApiKey(req);
    if ('error' in auth) return auth.error;
    const { supabase, company, settings } = auth;
    const companyId = company.id;
    const url = req.nextUrl;

    const date = url.searchParams.get('date');
    const requestedDuration = parseInt(url.searchParams.get('duration_minutes') ?? '', 10);
    const assignedTo = url.searchParams.get('assigned_to');

    if (!date) return apiError('Parâmetro date é obrigatório (YYYY-MM-DD).', 'MISSING_DATE', 200);

    const businessHours = settings.business_hours || defaultBusinessHours;
    const apptSettings = getEffectiveAppointmentSettings(settings.appointment_settings);
    const effectiveDuration = Number.isFinite(requestedDuration) && requestedDuration > 0 ? requestedDuration : apptSettings.default_duration_minutes;

    const requestedDate = new Date(date);
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][requestedDate.getDay()];
    const dayHours = businessHours[dayOfWeek];

    if (!dayHours?.enabled) return apiSuccess({ date, available_slots: [], message: 'Dia não útil.' });
    if ((settings.holidays || []).some(h => h.date === date)) return apiSuccess({ date, available_slots: [], message: 'Feriado.' });

    const BRAZIL_OFFSET = -3;
    const [year, month, day] = date.split('-').map(Number);
    const [startHour, startMinute] = dayHours.start.split(':').map(Number);
    const [endHour, endMinute] = dayHours.end.split(':').map(Number);

    const dayStart = new Date(Date.UTC(year, month - 1, day, 0 - BRAZIL_OFFSET, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(year, month - 1, day, 23 - BRAZIL_OFFSET, 59, 59, 999));

    let query = supabase!.from('appointments')
      .select('id, scheduled_for, duration_minutes, client:clients(first_name, last_name)')
      .eq('company_id', companyId).gte('scheduled_for', dayStart.toISOString())
      .lte('scheduled_for', dayEnd.toISOString()).neq('status', 'cancelled');
    if (assignedTo) query = query.eq('assigned_to', assignedTo);

    const { data: existing } = await query;

    const bufferMs = (apptSettings.buffer_between_appointments_minutes || 0) * 60 * 1000;
    const checkConflict = (slotStart: Date, slotEnd: Date) => {
      for (const a of existing || []) {
        const aStart = new Date(a.scheduled_for);
        const aEnd = new Date(aStart.getTime() + (a.duration_minutes || 60) * 60 * 1000 + bufferMs);
        if (slotStart < aEnd && slotEnd > aStart) {
          const c = a.client as any;
          return { hasConflict: true, clientName: c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Cliente' : 'Cliente' };
        }
      }
      return { hasConflict: false, clientName: null };
    };

    const available_slots: string[] = [];
    let current = new Date(Date.UTC(year, month - 1, day, startHour - BRAZIL_OFFSET, startMinute, 0, 0));
    const endTime = new Date(Date.UTC(year, month - 1, day, endHour - BRAZIL_OFFSET, endMinute, 0, 0));
    const now = new Date();
    const minNotice = new Date(now.getTime() + apptSettings.min_notice_hours * 60 * 60 * 1000);

    while (current < endTime) {
      const slotEnd = new Date(current.getTime() + effectiveDuration * 60 * 1000);
      if (slotEnd <= endTime && current >= minNotice) {
        const conflict = checkConflict(current, slotEnd);
        if (!conflict.hasConflict) {
          const brazilTime = formatWithBrazilOffset(current);
          available_slots.push(brazilTime.slice(11, 16)); // "HH:MM"
        }
      }
      current = new Date(current.getTime() + effectiveDuration * 60 * 1000);
    }

    if (available_slots.length === 0) {
      return apiSuccess({ date, available_slots: [], message: 'Nenhum horário disponível nesta data.' });
    }

    return apiSuccess({ date, available_slots, message: `${available_slots.length} horário(s) disponível(is).` });
  } catch (error) {
    console.error('[appointments/slots]', error);
    return apiError('Erro interno.', 'INTERNAL_ERROR', 200);
  }
}
