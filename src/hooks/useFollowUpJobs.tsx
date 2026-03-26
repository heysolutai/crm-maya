import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from './useAuth';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { useToast } from './use-toast';

export interface FollowUpJob {
  id: string;
  company_id: string;
  conversation_id: string;
  client_id: string;
  stage_order: number;
  scheduled_for: string;
  status: 'pending' | 'sent' | 'cancelled' | 'failed';
  message_text: string;
  whatsapp_instance_id: string | null;
  attempts: number;
  last_attempt_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  client?: {
    first_name: string;
    last_name: string | null;
    phone: string;
  };
  company?: {
    name: string;
  };
  conversation?: {
    started_at: string;
  };
}

interface Filters {
  status?: string;
  companyId?: string;
  clientSearch?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useFollowUpJobs(filters?: Filters) {
  const { role } = useAuth();
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['follow-up-jobs', companyId, filters, role],
    queryFn: async () => {
      // Para usuários normais, exigir companyId
      if (role !== 'super_admin' && !companyId) {
        return [];
      }

      let query = supabase
        .from('follow_up_jobs')
        .select(`
          *,
          client:clients(first_name, last_name, phone),
          company:companies(name),
          conversation:conversations(started_at)
        `)
        .order('scheduled_for', { ascending: false });

      // Sempre filtrar por empresa (para usuários normais é obrigatório, para super_admin é opcional)
      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters?.companyId) {
        query = query.eq('company_id', filters.companyId);
      }

      if (filters?.clientSearch) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('id')
          .or(`first_name.ilike.%${filters.clientSearch}%,phone.ilike.%${filters.clientSearch}%`);
        
        if (clientData && clientData.length > 0) {
          const clientIds = clientData.map(c => c.id);
          query = query.in('client_id', clientIds);
        } else {
          return [];
        }
      }

      if (filters?.dateFrom) {
        query = query.gte('scheduled_for', filters.dateFrom);
      }

      if (filters?.dateTo) {
        query = query.lte('scheduled_for', filters.dateTo);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as FollowUpJob[];
    },
    enabled: !!companyId || role === 'super_admin',
  });

  const cancelJob = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from('follow_up_jobs')
        .update({ status: 'cancelled' })
        .eq('id', jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-up-jobs'] });
      toast({ title: 'Job cancelado com sucesso!' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao cancelar job',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const rescheduleJob = useMutation({
    mutationFn: async ({ jobId, newDate }: { jobId: string; newDate: string }) => {
      const { error } = await supabase
        .from('follow_up_jobs')
        .update({ 
          scheduled_for: newDate,
          status: 'pending',
          attempts: 0,
          error_message: null,
        })
        .eq('id', jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-up-jobs'] });
      toast({ title: 'Job reagendado com sucesso!' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao reagendar job',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const stats = {
    pending: jobs?.filter(j => j.status === 'pending').length || 0,
    sent: jobs?.filter(j => j.status === 'sent').length || 0,
    failed: jobs?.filter(j => j.status === 'failed').length || 0,
    cancelled: jobs?.filter(j => j.status === 'cancelled').length || 0,
    total: jobs?.length || 0,
    successRate: jobs && jobs.length > 0 
      ? ((jobs.filter(j => j.status === 'sent').length / jobs.length) * 100).toFixed(1)
      : '0.0',
  };

  return {
    jobs,
    isLoading,
    stats,
    cancelJob: cancelJob.mutate,
    isCancelling: cancelJob.isPending,
    rescheduleJob: rescheduleJob.mutate,
    isRescheduling: rescheduleJob.isPending,
  };
}
