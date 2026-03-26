import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase-functions-adapter';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { useToast } from './use-toast';

interface GoogleCalendarConnection {
  id: string;
  company_id: string;
  calendar_id: string;
  calendar_name: string;
  connected_email: string | null;
  is_active: boolean;
  sync_enabled: boolean;
  create_meet_links: boolean;
  created_at: string;
  updated_at: string;
}

export function useGoogleCalendar() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Buscar conexão existente
  const { data: connection, isLoading } = useQuery({
    queryKey: ['google-calendar-connection', companyId],
    queryFn: async () => {
      if (!companyId) return null;

      const { data, error } = await supabase
        .from('google_calendar_connections')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching Google Calendar connection:', error);
        return null;
      }

      return data as GoogleCalendarConnection | null;
    },
    enabled: !!companyId,
  });

  // Iniciar processo de conexão
  const connectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeFn('google-calendar-auth');

      if (error) throw error;
      if (!data?.url) throw new Error('Failed to get auth URL');

      return data.url;
    },
    onSuccess: (url) => {
      // Abrir popup de autorização
      window.open(url, '_blank', 'width=500,height=600');
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao conectar',
        description: error.message || 'Não foi possível iniciar a conexão',
        variant: 'destructive',
      });
    },
  });

  // Desconectar
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await invokeFn('disconnect-google-calendar');
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-connection'] });
      toast({
        title: 'Google Calendar desconectado',
        description: 'A integração foi removida com sucesso',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao desconectar',
        description: error.message || 'Não foi possível desconectar',
        variant: 'destructive',
      });
    },
  });

  // Atualizar configurações
  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: { sync_enabled?: boolean; create_meet_links?: boolean }) => {
      if (!connection?.id) throw new Error('No connection found');

      const { error } = await supabase
        .from('google_calendar_connections')
        .update(settings)
        .eq('id', connection.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-connection'] });
      toast({
        title: 'Configurações atualizadas',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    connection,
    isLoading,
    isConnected: !!connection?.is_active,
    connect: connectMutation.mutate,
    isConnecting: connectMutation.isPending,
    disconnect: disconnectMutation.mutate,
    isDisconnecting: disconnectMutation.isPending,
    updateSettings: updateSettingsMutation.mutate,
    isUpdating: updateSettingsMutation.isPending,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['google-calendar-connection'] }),
  };
}
