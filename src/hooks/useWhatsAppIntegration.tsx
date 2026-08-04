import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { useToast } from './use-toast';
import { apiFetch } from '@/lib/api/client';

/**
 * @deprecated Use `useInboxes` em vez disso. Mantido temporariamente apenas
 * pra Settings legado. Migrou de `/api/whatsapp-instances` + `/api/whatsapp/connect`
 * (removidos) para `/api/agents` + `/api/agents/[id]/*`.
 */
export function useWhatsAppIntegration() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: instances, isLoading } = useQuery({
    queryKey: ['whatsapp-instances', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const res = await apiFetch(`/api/agents?companyId=${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch instances');
      return await res.json();
    },
    enabled: !!companyId,
  });

  const reconnectMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      const res = await apiFetch(`/api/agents/${instanceId}/qr`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao reconectar');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
      toast({ title: 'WhatsApp reconectando', description: data.message });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao reconectar WhatsApp', description: error.message, variant: 'destructive' });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      const res = await apiFetch(`/api/agents/${instanceId}/disconnect`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao desconectar');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
      toast({ title: 'WhatsApp desconectado', description: data.message });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao desconectar WhatsApp', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      const res = await apiFetch(`/api/agents?id=${instanceId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao excluir');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
      toast({ title: 'Instância excluída', description: data.message });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao excluir instância', description: error.message, variant: 'destructive' });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      const res = await apiFetch(`/api/agents/${instanceId}/status`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Falha ao atualizar status');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
    },
    onError: (error: any) => {
      const msg = error?.message || ''
      if (msg.includes('Instância não encontrada') || msg.includes('INSTANCE_NOT_FOUND')) {
        return
      }
      toast({ title: 'Erro ao atualizar status', description: msg, variant: 'destructive' });
    },
  });

  // O flow novo cria inboxes via `useInboxes().createInbox()`, nao via "connect".
  // Mantemos um stub que so loga warning pra nao quebrar quem ainda chama.
  const connectMutation = useMutation({
    mutationFn: async () => {
      console.warn('[useWhatsAppIntegration] connectWhatsApp() esta deprecado — use useInboxes().createInbox()');
      return { success: false } as any;
    },
  });

  return {
    instances,
    isLoading,
    connectWhatsApp: connectMutation.mutate,
    reconnectWhatsApp: reconnectMutation.mutate,
    disconnectWhatsApp: disconnectMutation.mutate,
    deleteWhatsApp: deleteMutation.mutate,
    updateStatus: updateStatusMutation.mutate,
    isConnecting: connectMutation.isPending,
    isReconnecting: reconnectMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isUpdating: updateStatusMutation.isPending,
  };
}
