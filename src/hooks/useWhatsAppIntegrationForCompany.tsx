import { apiFetch } from '@/lib/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from './use-toast';
import { getErrorMessage } from '@/utils/getErrorMessage';

/**
 * @deprecated Use `useInboxes` em vez disso. Mantido pra super-admin/WhatsAppConfigCard.
 * Migrou de `/api/whatsapp-instances` + `/api/whatsapp/connect` (removidos)
 * para `/api/agents` + `/api/agents/[id]/*`.
 */
export function useWhatsAppIntegrationForCompany(companyId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: instances, isLoading } = useQuery({
    queryKey: ['whatsapp-instances', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const res = await apiFetch(`/api/agents?companyId=${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch instances');
      const data = await res.json();
      return (data || []).map((item: any) => ({
        ...item,
        instance_name: item.instanceName ?? item.instance_name ?? item.displayName ?? item.display_name,
        instance_api_key: item.instanceApiKey ?? item.instance_api_key,
        qr_code: item.qrCode ?? item.qr_code,
        is_active: item.isActive ?? item.is_active,
      }));
    },
    enabled: !!companyId,
  });

  // No flow novo, criar inbox via super-admin nao e suportado por aqui.
  const connectMutation = useMutation({
    mutationFn: async () => {
      console.warn('[useWhatsAppIntegrationForCompany] connectWhatsApp() esta deprecado — use useInboxes().createInbox()');
      return { success: false, data: null } as any;
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao conectar WhatsApp', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const reconnectMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      const res = await apiFetch(`/api/agents/${instanceId}/qr?companyId=${companyId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao reconectar');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances', companyId] });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao reconectar WhatsApp', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      const res = await apiFetch(`/api/agents/${instanceId}/disconnect?companyId=${companyId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao desconectar');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances', companyId] });
      toast({ title: 'WhatsApp desconectado', description: data.message });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao desconectar WhatsApp', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      const res = await apiFetch(`/api/agents?id=${instanceId}&companyId=${companyId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao excluir');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances', companyId] });
      toast({ title: 'Instância excluída', description: data.message });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao excluir instância', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      const res = await apiFetch(`/api/agents/${instanceId}/status?companyId=${companyId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Falha ao atualizar status');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances', companyId] });
    },
    onError: (error: any) => {
      const msg = error?.message || ''
      if (msg.includes('Instância não encontrada') || msg.includes('INSTANCE_NOT_FOUND')) {
        return // silencioso — id stale, proximo refetch corrige
      }
      console.warn('[whatsapp:update]', msg);
    },
  });

  return {
    instances,
    isLoading,
    connectWhatsApp: connectMutation.mutateAsync,
    reconnectWhatsApp: reconnectMutation.mutateAsync,
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
