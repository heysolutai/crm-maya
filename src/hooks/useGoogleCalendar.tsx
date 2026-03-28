import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeFn } from '@/lib/api-functions';
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

  const { data: connection, isLoading } = useQuery({
    queryKey: ['google-calendar-connection', companyId],
    queryFn: async () => {
      if (!companyId) return null;

      const res = await fetch(`/api/google-calendar-connections?companyId=${companyId}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data) return null;

      return {
        ...data,
        company_id: data.companyId || data.company_id,
        calendar_id: data.calendarId || data.calendar_id,
        calendar_name: data.calendarName || data.calendar_name,
        connected_email: data.connectedEmail || data.connected_email,
        is_active: data.isActive ?? data.is_active,
        sync_enabled: data.syncEnabled ?? data.sync_enabled,
        create_meet_links: data.createMeetLinks ?? data.create_meet_links,
        created_at: data.createdAt || data.created_at,
        updated_at: data.updatedAt || data.updated_at,
      } as GoogleCalendarConnection;
    },
    enabled: !!companyId,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeFn('google-calendar-auth');
      if (error) throw error;
      if (!data?.url) throw new Error('Failed to get auth URL');
      return data.url;
    },
    onSuccess: (url) => {
      window.open(url, '_blank', 'width=500,height=600');
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao conectar', description: error.message || 'Não foi possível iniciar a conexão', variant: 'destructive' });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await invokeFn('disconnect-google-calendar');
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-connection'] });
      toast({ title: 'Google Calendar desconectado', description: 'A integração foi removida com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao desconectar', description: error.message || 'Não foi possível desconectar', variant: 'destructive' });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: { sync_enabled?: boolean; create_meet_links?: boolean }) => {
      if (!connection?.id) throw new Error('No connection found');

      const res = await fetch('/api/google-calendar-connections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: connection.id,
          syncEnabled: settings.sync_enabled,
          createMeetLinks: settings.create_meet_links,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update settings');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-connection'] });
      toast({ title: 'Configurações atualizadas' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
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
