import { apiFetch } from '@/lib/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { useToast } from './use-toast';

export interface Reminder {
  id: string;
  company_id: string;
  conversation_id: string;
  client_id: string;
  created_by: string;
  scheduled_for: string;
  message_text: string;
  status: 'pending' | 'sent' | 'cancelled' | 'failed';
  attempts: number;
  error_message?: string;
  sent_at?: string;
  created_at: string;
}

function mapReminder(raw: any): Reminder {
  return {
    id: raw.id,
    company_id: raw.companyId ?? raw.company_id,
    conversation_id: raw.conversationId ?? raw.conversation_id,
    client_id: raw.clientId ?? raw.client_id,
    created_by: raw.createdBy ?? raw.created_by,
    scheduled_for: raw.scheduledFor ?? raw.scheduled_for,
    message_text: raw.messageText ?? raw.message_text,
    status: raw.status,
    attempts: raw.attempts,
    error_message: raw.errorMessage ?? raw.error_message,
    sent_at: raw.sentAt ?? raw.sent_at,
    created_at: raw.createdAt ?? raw.created_at,
  };
}

export function useReminders(conversationId?: string) {
  const { user } = useAuth();
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch reminders for a conversation
  const { data: reminders, isLoading } = useQuery({
    queryKey: ['reminders', conversationId],
    queryFn: async () => {
      if (!conversationId || !companyId) return [];

      const res = await apiFetch(`/api/reminders?companyId=${companyId}&conversationId=${conversationId}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch reminders');
      const data = await res.json();
      return (data || []).map(mapReminder) as Reminder[];
    },
    enabled: !!conversationId && !!companyId,
  });

  // Fetch all pending reminders for the company
  const { data: allPendingReminders } = useQuery({
    queryKey: ['reminders', 'pending', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const res = await apiFetch(`/api/reminders?companyId=${companyId}&pendingOnly=true`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch pending reminders');
      return await res.json();
    },
    enabled: !!companyId,
  });

  // Create a new reminder
  const createReminder = useMutation({
    mutationFn: async ({
      conversationId,
      clientId,
      scheduledFor,
      messageText,
    }: {
      conversationId: string;
      clientId: string;
      scheduledFor: Date;
      messageText: string;
    }) => {
      if (!companyId || !user?.id) throw new Error('Missing company or user');

      const res = await apiFetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          conversation_id: conversationId,
          client_id: clientId,
          created_by: user.id,
          scheduled_for: scheduledFor.toISOString(),
          message_text: messageText,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create reminder');
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast({ title: 'Lembrete agendado com sucesso!' });
    },
    onError: (error) => {
      console.error('Error creating reminder:', error);
      toast({
        title: 'Erro ao criar lembrete',
        description: 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  // Cancel a reminder
  const cancelReminder = useMutation({
    mutationFn: async (reminderId: string) => {
      const res = await apiFetch('/api/reminders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reminderId, status: 'cancelled' }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to cancel reminder');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast({ title: 'Lembrete cancelado' });
    },
    onError: (error) => {
      console.error('Error cancelling reminder:', error);
      toast({
        title: 'Erro ao cancelar lembrete',
        variant: 'destructive',
      });
    },
  });

  // Count pending reminders for a conversation
  const getPendingCount = (convId?: string) => {
    if (!convId) return 0;
    return reminders?.filter(r => r.status === 'pending').length || 0;
  };

  return {
    reminders,
    allPendingReminders,
    isLoading,
    createReminder,
    cancelReminder,
    getPendingCount,
  };
}
