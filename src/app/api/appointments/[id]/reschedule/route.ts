import { NextRequest } from 'next/server';
import { handleCors, jsonResponse } from '@/lib/api/cors';
import { apiError, apiSuccess, authenticateApiKey, syncWithGoogleCalendar } from '@/lib/api/appointments-helpers';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(req);
    if ('error' in auth) return auth.error;
    const { supabase, company } = auth;

    const { new_scheduled_for, new_duration_minutes, reason } = await req.json();
    if (!new_scheduled_for) return apiError('new_scheduled_for é obrigatório.', 'MISSING_NEW_DATE', 200);

    const { data: existing, error: fetchError } = await supabase!.from('appointments')
      .select('*').eq('id', id).eq('company_id', company.id).single();
    if (fetchError || !existing) return apiError('Agendamento não encontrado.', 'NOT_FOUND', 200);
    if (existing.status === 'cancelled') return apiError('Não é possível remarcar cancelado.', 'CANCELLED', 200);

    const duration = new_duration_minutes || existing.duration_minutes;
    const { data: conflictData } = await supabase!.rpc('check_appointment_conflict', {
      p_company_id: company.id, p_scheduled_for: new_scheduled_for,
      p_duration_minutes: duration, p_assigned_to: existing.assigned_to, p_exclude_appointment_id: id,
    });

    if (conflictData?.[0]?.has_conflict) {
      return apiError(`Horário ocupado por ${conflictData[0].conflicting_client_name || 'outro cliente'}.`, 'CONFLICT', 200);
    }

    const updateData: any = { scheduled_for: new_scheduled_for, duration_minutes: duration, updated_at: new Date().toISOString() };
    if (reason) updateData.notes = existing.notes ? `${existing.notes}\n\n[Remarcado] ${reason}` : `[Remarcado] ${reason}`;

    const { data: updated, error } = await supabase!.from('appointments')
      .update(updateData).eq('id', id).select('*, client:clients(first_name, last_name)').single();
    if (error) return apiError('Erro ao remarcar.', 'RESCHEDULE_ERROR', 200);

    syncWithGoogleCalendar(company.id, id, 'update', existing.google_event_id);
    return apiSuccess(updated);
  } catch (error) {
    return apiError('Erro interno.', 'INTERNAL_ERROR', 200);
  }
}
