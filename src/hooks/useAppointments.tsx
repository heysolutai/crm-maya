import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase-functions-adapter';
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

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id, company_id, client_id, title, description, scheduled_for,
          duration_minutes, status, assigned_to, location, meeting_url, notes,
          reminder_sent, google_event_id, created_by, created_at, updated_at,
          clients(first_name, last_name, full_name)
        `)
        .eq('company_id', companyId)
        .order('scheduled_for', { ascending: true })
        .limit(1000);

      if (error) throw error;
      return data || [];
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
      const { data, error } = await supabase
        .from('appointments')
        .insert([{
          ...appointmentData,
          company_id: companyId,
          client_id: appointmentData.client_id,
          title: appointmentData.title,
          scheduled_for: appointmentData.scheduled_for,
          created_by: appointmentData.created_by
        }])
        .select()
        .single();

      if (error) throw error;

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
      const appointment = appointments.find(a => a.id === id);

      const { error } = await supabase
        .from('appointments')
        .update(appointmentData)
        .eq('id', id);

      if (error) throw error;

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
      const appointment = appointments.find(a => a.id === id);

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

      const { error, count } = await supabase
        .from('appointments')
        .delete({ count: 'exact' })
        .eq('id', id);

      if (error) throw error;

      if (count === 0) {
        toast({
          title: 'Erro ao remover agendamento',
          description: 'Não foi possível excluir. Verifique suas permissões.',
          variant: 'destructive',
        });
        return false;
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
