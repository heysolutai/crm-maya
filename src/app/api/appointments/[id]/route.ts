import { NextRequest } from 'next/server';
import { handleCors, jsonResponse } from '@/lib/api/cors';
import { apiError, apiSuccess, formatWithBrazilOffset, authenticateApiKey, syncWithGoogleCalendar } from '@/lib/api/appointments-helpers';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(req);
    if ('error' in auth) return auth.error;
    const { supabase, company } = auth;

    const { data: appointment, error } = await supabase!.from('appointments')
      .select('*, client:clients(id, first_name, last_name, phone, email), assigned_user:users!appointments_assigned_to_fkey(id, full_name)')
      .eq('id', id).eq('company_id', company.id).single();

    if (error || !appointment) return apiError('Agendamento não encontrado.', 'NOT_FOUND', 200);
    return apiSuccess({ ...appointment, scheduled_for: formatWithBrazilOffset(new Date(appointment.scheduled_for)) });
  } catch (error) {
    return apiError('Erro interno.', 'INTERNAL_ERROR', 200);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(req);
    if ('error' in auth) return auth.error;
    const { supabase, company } = auth;
    const reason = req.nextUrl.searchParams.get('reason');

    const { data: existing, error: fetchError } = await supabase!.from('appointments')
      .select('*').eq('id', id).eq('company_id', company.id).single();

    if (fetchError || !existing) return apiError('Agendamento não encontrado.', 'NOT_FOUND', 200);
    if (existing.status === 'cancelled') return apiError('Já cancelado.', 'ALREADY_CANCELLED', 200);

    const { data: cancelled, error: cancelError } = await supabase!.from('appointments')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: reason || 'Cancelado via API' })
      .eq('id', id).select().single();

    if (cancelError) return apiError('Erro ao cancelar.', 'CANCEL_ERROR', 200);

    await supabase!.from('reminders').update({ status: 'cancelled' }).eq('appointment_id', id).eq('status', 'pending');
    syncWithGoogleCalendar(company.id, id, 'delete', existing.google_event_id);
    return apiSuccess(cancelled);
  } catch (error) {
    return apiError('Erro interno.', 'INTERNAL_ERROR', 200);
  }
}
