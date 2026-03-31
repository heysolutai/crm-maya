import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeFn } from '@/lib/api-functions';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { toast } from '@/hooks/use-toast';

export interface Appointment {
  id: string;
  company_id: string;
  client_id: string;
  title: string;
  description?: string;
  scheduled_for: string;
  duration_minutes: number;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  assigned_to?: string;
  location?: string;
  meeting_url?: string;
  notes?: string;
  reminder_sent: boolean;
  reminder_sent_at?: string;
  cancelled_by?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  metadata?: any;
  created_by: string;
  created_at: string;
  updated_at: string;
  google_event_id?: string;
}

export function useAppointments() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  const { data: appointments = [], isLoading: loading } = useQuery({
    queryKey: ['appointments', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const res = await fetch(`/api/appointments?company_id=${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch appointments');
      const data = await res.json();
      // Normalize if needed
      return (Array.isArray(data) ? data : data.appointments || []).map((a: Record<string, any>) => ({
        ...a,
        company_id: a.companyId || a.company_id,
        client_id: a.clientId || a.client_id,
        scheduled_for: a.scheduledFor || a.scheduled_for,
        duration_minutes: a.durationMinutes || a.duration_minutes,
        assigned_to: a.assignedTo || a.assigned_to,
        meeting_url: a.meetingUrl || a.meeting_url,
        reminder_sent: a.reminderSent ?? a.reminder_sent,
        google_event_id: a.googleEventId || a.google_event_id,
        created_by: a.createdBy || a.created_by,
        created_at: a.createdAt || a.created_at,
        updated_at: a.updatedAt || a.updated_at,
        clients: a.client || a.clients,
      }));
    },
    enabled: !!companyId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['appointments', companyId] });

  const createAppointment = async (appointmentData: Partial<Appointment>) => {
    if (!companyId) return null;
    if (!appointmentData.client_id || !appointmentData.title || !appointmentData.scheduled_for || !appointmentData.created_by) {
      toast({ title: 'Erro', description: 'Campos obrigatórios faltando', variant: 'destructive' });
      return null;
    }

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...appointmentData,
          company_id: companyId,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create appointment');
      }
      const data = await res.json();

      toast({ title: 'Agendamento criado', description: 'Agendamento adicionado com sucesso!' });
      invalidate();
      return data;
    } catch (error: any) {
      toast({ title: 'Erro ao criar agendamento', description: error.message, variant: 'destructive' });
      return null;
    }
  };

  const updateAppointment = async (id: string, appointmentData: Partial<Appointment>) => {
    try {
      const appointment = appointments.find((a: Appointment) => a.id === id);

      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appointmentData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update appointment');
      }

      if (appointmentData.status === 'cancelled' && appointment) {
        try {
          await invokeFn('sync-google-calendar', {
            action: 'delete',
            appointment_id: id,
            company_id: appointment.company_id,
          });
        } catch (syncError) {
          console.error('Error syncing with Google Calendar:', syncError);
        }
      } else if (appointment) {
        try {
          await invokeFn('sync-google-calendar', {
            action: 'update',
            appointment_id: id,
            company_id: appointment.company_id,
          });
        } catch (syncError) {
          console.error('Error syncing with Google Calendar:', syncError);
        }
      }

      toast({ title: 'Agendamento atualizado', description: 'Alterações salvas com sucesso!' });
      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar agendamento', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  const deleteAppointment = async (id: string, deleteFromGoogleCalendar = true) => {
    try {
      const appointment = appointments.find((a: Appointment) => a.id === id);

      if (deleteFromGoogleCalendar && appointment?.google_event_id) {
        try {
          await invokeFn('sync-google-calendar', {
            action: 'delete',
            appointment_id: id,
            company_id: appointment.company_id,
          });
        } catch (syncError) {
          console.error('Error syncing with Google Calendar:', syncError);
        }
      }

      const res = await fetch(`/api/appointments/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete appointment');
      }

      toast({
        title: 'Agendamento removido',
        description: deleteFromGoogleCalendar && appointment?.google_event_id
          ? 'Agendamento excluído do sistema e do Google Calendar!'
          : 'Agendamento excluído com sucesso!',
      });

      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao remover agendamento', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  return {
    appointments,
    loading,
    fetchAppointments: invalidate,
    createAppointment,
    updateAppointment,
    deleteAppointment,
  };
}
