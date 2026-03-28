import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

function mapJob(raw: any): FollowUpJob {
  return {
    id: raw.id,
    company_id: raw.companyId ?? raw.company_id,
    conversation_id: raw.conversationId ?? raw.conversation_id,
    client_id: raw.clientId ?? raw.client_id,
    stage_order: raw.stageOrder ?? raw.stage_order,
    scheduled_for: raw.scheduledFor ?? raw.scheduled_for,
    status: raw.status,
    message_text: raw.messageText ?? raw.message_text,
    whatsapp_instance_id: raw.whatsappInstanceId ?? raw.whatsapp_instance_id,
    attempts: raw.attempts,
    last_attempt_at: raw.lastAttemptAt ?? raw.last_attempt_at,
    error_message: raw.errorMessage ?? raw.error_message,
    created_at: raw.createdAt ?? raw.created_at,
    updated_at: raw.updatedAt ?? raw.updated_at,
    client: raw.client ? {
      first_name: raw.client.firstName ?? raw.client.first_name,
      last_name: raw.client.lastName ?? raw.client.last_name,
      phone: raw.client.phone,
    } : undefined,
    company: raw.company ? { name: raw.company.name } : undefined,
    conversation: raw.conversation ? {
      started_at: raw.conversation.startedAt ?? raw.conversation.started_at,
    } : undefined,
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
      if (role !== 'super_admin' && !companyId) {
        return [];
      }

      const params = new URLSearchParams();
      if (companyId) params.set('companyId', companyId);
      if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
      if (filters?.companyId) params.set('filterCompanyId', filters.companyId);
      if (filters?.clientSearch) params.set('clientSearch', filters.clientSearch);
      if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters?.dateTo) params.set('dateTo', filters.dateTo);

      const res = await fetch(`/api/follow-up-jobs?${params.toString()}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch follow-up jobs');
      const data = await res.json();
      return (data || []).map(mapJob) as FollowUpJob[];
    },
    enabled: !!companyId || role === 'super_admin',
  });

  const cancelJob = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch('/api/follow-up-jobs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: jobId, status: 'cancelled' }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to cancel job');
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
      const res = await fetch('/api/follow-up-jobs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: jobId,
          scheduledFor: newDate,
          status: 'pending',
          attempts: 0,
          errorMessage: null,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to reschedule job');
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
