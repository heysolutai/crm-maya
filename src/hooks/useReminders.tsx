import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
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

export function useReminders(conversationId?: string) {
  const { user } = useAuth();
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Buscar lembretes da conversa
  const { data: reminders, isLoading } = useQuery({
    queryKey: ['reminders', conversationId],
    queryFn: async () => {
      if (!conversationId || !companyId) return [];

      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('company_id', companyId)
        .order('scheduled_for', { ascending: true });

      if (error) throw error;
      return data as Reminder[];
    },
    enabled: !!conversationId && !!companyId,
  });

  // Buscar todos os lembretes pendentes da empresa
  const { data: allPendingReminders } = useQuery({
    queryKey: ['reminders', 'pending', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('reminders')
        .select(`
          *,
          client:clients(first_name, phone),
          conversation:conversations(id)
        `)
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .order('scheduled_for', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Criar novo lembrete
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

      const { data, error } = await supabase
        .from('reminders')
        .insert({
          company_id: companyId,
          conversation_id: conversationId,
          client_id: clientId,
          created_by: user.id,
          scheduled_for: scheduledFor.toISOString(),
          message_text: messageText,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
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
        variant: 'destructive' 
      });
    },
  });

  // Cancelar lembrete
  const cancelReminder = useMutation({
    mutationFn: async (reminderId: string) => {
      const { error } = await supabase
        .from('reminders')
        .update({ status: 'cancelled' })
        .eq('id', reminderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast({ title: 'Lembrete cancelado' });
    },
    onError: (error) => {
      console.error('Error cancelling reminder:', error);
      toast({ 
        title: 'Erro ao cancelar lembrete', 
        variant: 'destructive' 
      });
    },
  });

  // Contar lembretes pendentes de uma conversa
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
