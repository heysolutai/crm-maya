import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { handleCors, jsonResponse } from '@/lib/api/cors';
import {
  apiError, apiSuccess, formatWithBrazilOffset, defaultBusinessHours,
  getEffectiveAppointmentSettings, authenticateApiKey, syncWithGoogleCalendar,
} from '@/lib/api/appointments-helpers';

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateApiKey(req);
    if ('error' in auth) return auth.error;
    const { supabase, company } = auth;
    const companyId = company.id;
    const url = req.nextUrl;

    const status = url.searchParams.get('status');
    let clientId = url.searchParams.get('client_id');
    const phone = url.searchParams.get('phone');
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');
    const assignedTo = url.searchParams.get('assigned_to');

    if (!clientId && phone) {
      const normalizedPhone = phone.replace(/\D/g, '');
      const phoneSuffix = normalizedPhone.slice(-8).replace(/[,.()\\'"%]/g, '');
      const { data: clientByPhone } = await supabase!
        .from('clients').select('id').eq('company_id', companyId)
        .or(`phone.eq.${normalizedPhone},phone.like.%${phoneSuffix}%`)
        .limit(1).maybeSingle();
      if (!clientByPhone) return apiSuccess({ appointments: [], message: `Nenhum cliente encontrado com o telefone ${phone}.` });
      clientId = clientByPhone.id;
    }

    let query = supabase!
      .from('appointments')
      .select('*, client:clients(id, first_name, last_name, phone, email), assigned_user:users!appointments_assigned_to_fkey(id, full_name)')
      .eq('company_id', companyId).order('scheduled_for', { ascending: true });

    if (status) query = query.eq('status', status as any);
    if (clientId) query = query.eq('client_id', clientId);
    if (assignedTo) query = query.eq('assigned_to', assignedTo);
    if (dateFrom) query = query.gte('scheduled_for', dateFrom);
    if (dateTo) query = query.lte('scheduled_for', dateTo);

    const { data: appointments, error } = await query;
    if (error) return apiError('Erro ao listar agendamentos.', 'FETCH_ERROR', 200);
    if (!appointments?.length) return apiSuccess({ appointments: [], message: 'Nenhum agendamento encontrado.' });

    return apiSuccess({
      appointments: appointments.map(a => ({ ...a, scheduled_for: formatWithBrazilOffset(new Date(a.scheduled_for)) })),
      message: `${appointments.length} agendamento(s) encontrado(s).`,
    });
  } catch (error) {
    console.error('[appointments GET]', error);
    return apiError('Erro interno do servidor.', 'INTERNAL_ERROR', 200);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateApiKey(req);
    if ('error' in auth) return auth.error;
    const { supabase, company, settings } = auth;
    const companyId = company.id;

    const body = await req.json();
    const { client_id, phone, title, scheduled_for, duration_minutes = 60, assigned_to, location, description, notes, patient_name } = body;

    if (!title || !scheduled_for) return apiError('Campos obrigatórios: title, scheduled_for.', 'MISSING_FIELDS', 200);
    if (!client_id && !phone) return apiError('Informe client_id ou phone.', 'MISSING_CLIENT_IDENTIFIER', 200);

    let resolvedClientId = client_id;
    if (!resolvedClientId && phone) {
      const normalizedPhone = phone.replace(/\D/g, '');
      const phoneSuffix = normalizedPhone.slice(-8).replace(/[,.()\\'"%]/g, '');
      const { data: c } = await supabase!.from('clients').select('id').eq('company_id', companyId)
        .or(`phone.eq.${normalizedPhone},phone.like.%${phoneSuffix}%`).limit(1).maybeSingle();
      if (!c) return apiError(`Cliente com telefone ${phone} não encontrado.`, 'CLIENT_NOT_FOUND', 200);
      resolvedClientId = c.id;
    }

    const apptSettings = getEffectiveAppointmentSettings(settings.appointment_settings);
    const rawDateTime = scheduled_for.replace(/[Zz]$/, '').replace(/[+-]\d{2}:\d{2}$/, '').replace(/[+-]\d{4}$/, '');
    const scheduledDate = new Date(rawDateTime + '-03:00');
    const normalizedScheduledFor = scheduledDate.toISOString();

    const now = new Date();
    const minNoticeTime = new Date(now.getTime() + apptSettings.min_notice_hours * 60 * 60 * 1000);
    if (scheduledDate < minNoticeTime) {
      return apiError(`Agendamento requer pelo menos ${apptSettings.min_notice_hours}h de antecedência.`, 'MIN_NOTICE', 200);
    }

    const maxAdvanceTime = new Date(now.getTime() + apptSettings.advance_booking_days * 24 * 60 * 60 * 1000);
    if (scheduledDate > maxAdvanceTime) {
      return apiError(`Máximo de ${apptSettings.advance_booking_days} dias de antecedência.`, 'MAX_ADVANCE', 200);
    }

    const { data: conflictData } = await supabase!.rpc('check_appointment_conflict', {
      p_company_id: companyId, p_scheduled_for: normalizedScheduledFor,
      p_duration_minutes: duration_minutes, p_assigned_to: assigned_to || null, p_exclude_appointment_id: null,
    });

    if (conflictData?.[0]?.has_conflict) {
      return apiError(`Horário já ocupado por ${conflictData[0].conflicting_client_name || 'outro cliente'}.`, 'CONFLICT', 200);
    }

    const { data: appointment, error: apptError } = await supabase!
      .from('appointments').insert({
        company_id: companyId, client_id: resolvedClientId, title, scheduled_for: normalizedScheduledFor,
        duration_minutes, assigned_to: assigned_to || null, location: location || null,
        description: description || null, notes: notes || null, patient_name: patient_name || null,
        status: 'scheduled', created_by: null,
      }).select('*, client:clients(first_name, last_name)').single();

    if (apptError) return apiError('Erro ao criar agendamento.', 'CREATE_ERROR', 200);

    syncWithGoogleCalendar(companyId, appointment.id, 'create');
    return apiSuccess(appointment, 201);
  } catch (error) {
    console.error('[appointments POST]', error);
    return apiError('Erro interno do servidor.', 'INTERNAL_ERROR', 200);
  }
}
