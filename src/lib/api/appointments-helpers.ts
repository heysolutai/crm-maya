import { createAdminClient } from '@/lib/supabase/admin';
import { jsonResponse, errorResponse, unauthorizedResponse } from '@/lib/api/cors';
import { NextResponse } from 'next/server';

export interface BusinessHours {
  enabled: boolean;
  start: string;
  end: string;
}

export interface AppointmentSettings {
  default_duration_minutes: number;
  slot_interval_minutes: number;
  buffer_between_appointments_minutes: number;
  max_appointments_per_slot: number;
  advance_booking_days: number;
  min_notice_hours: number;
}

export interface CompanySettings {
  business_hours?: Record<string, BusinessHours>;
  appointment_settings?: AppointmentSettings;
  holidays?: Array<{ date: string; name: string }>;
}

export const apiError = (message: string, errorCode: string, status: number) =>
  NextResponse.json({ success: false, error: errorCode, message }, { status });

export const apiSuccess = (data: unknown, status = 200) =>
  NextResponse.json({ success: true, data }, { status });

export const formatWithBrazilOffset = (date: Date): string => {
  const brazilOffset = -3;
  const localDate = new Date(date.getTime() + brazilOffset * 60 * 60 * 1000);
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const hours = String(localDate.getUTCHours()).padStart(2, '0');
  const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(localDate.getUTCSeconds()).padStart(2, '0');
  const ms = String(localDate.getUTCMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}-03:00`;
};

export const defaultBusinessHours: Record<string, BusinessHours> = {
  monday: { enabled: true, start: '08:00', end: '18:00' },
  tuesday: { enabled: true, start: '08:00', end: '18:00' },
  wednesday: { enabled: true, start: '08:00', end: '18:00' },
  thursday: { enabled: true, start: '08:00', end: '18:00' },
  friday: { enabled: true, start: '08:00', end: '18:00' },
  saturday: { enabled: false, start: '08:00', end: '12:00' },
  sunday: { enabled: false, start: '08:00', end: '12:00' },
};

export function getEffectiveAppointmentSettings(raw: Partial<AppointmentSettings> | undefined): AppointmentSettings {
  const r = raw || {};
  return {
    default_duration_minutes: r.default_duration_minutes && r.default_duration_minutes > 0 ? r.default_duration_minutes : 60,
    slot_interval_minutes: r.slot_interval_minutes && r.slot_interval_minutes > 0 ? r.slot_interval_minutes : 30,
    buffer_between_appointments_minutes: r.buffer_between_appointments_minutes ?? 0,
    max_appointments_per_slot: r.max_appointments_per_slot && r.max_appointments_per_slot > 0 ? r.max_appointments_per_slot : 1,
    advance_booking_days: r.advance_booking_days && r.advance_booking_days > 0 ? r.advance_booking_days : 30,
    min_notice_hours: typeof r.min_notice_hours === 'number' && r.min_notice_hours >= 0 ? r.min_notice_hours : 2,
  };
}

export async function authenticateApiKey(req: Request) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return { error: apiError('Chave de API não fornecida.', 'API_KEY_REQUIRED', 401) };

  const supabase = createAdminClient();
  const { data: keyData, error: keyError } = await supabase
    .from('api_keys').select('company_id, is_active, id').eq('key', apiKey).single();

  if (keyError || !keyData || !keyData.is_active) {
    return { error: apiError('Chave de API inválida ou inativa.', 'INVALID_API_KEY', 401) };
  }

  const { data: company, error: companyError } = await supabase
    .from('companies').select('id, name, settings').eq('id', keyData.company_id).single();

  if (companyError || !company) {
    return { error: apiError('Empresa não encontrada.', 'COMPANY_NOT_FOUND', 404) };
  }

  await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyData.id);

  return { supabase, company, settings: (company.settings || {}) as CompanySettings };
}

export async function syncWithGoogleCalendar(companyId: string, appointmentId: string, action: 'create' | 'update' | 'delete', googleEventId?: string | null) {
  const supabase = createAdminClient();
  try {
    const { data: conn } = await supabase
      .from('google_calendar_connections')
      .select('id, sync_enabled')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single();

    if (conn?.sync_enabled && (action === 'create' || googleEventId)) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (process.env.INTERNAL_API_SECRET) {
        headers['x-internal-key'] = process.env.INTERNAL_API_SECRET;
      }
      fetch(`${baseUrl}/api/calendar/sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, appointment_id: appointmentId, company_id: companyId }),
      }).catch(e => console.error('[Calendar Sync] Error:', e));
    }
  } catch (e) {
    console.error('[Calendar Sync] Error:', e);
  }
}
