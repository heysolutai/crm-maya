import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeFn } from '@/lib/api-functions';
import { useToast } from './use-toast';
import { getErrorMessage } from '@/utils/getErrorMessage';

export function useWhatsAppIntegrationForCompany(companyId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: instances, isLoading } = useQuery({
    queryKey: ['whatsapp-instances', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const res = await fetch(`/api/whatsapp-instances?companyId=${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch instances');
      const data = await res.json();
      // Map camelCase to snake_case for frontend compatibility
      return (data || []).map((item: any) => ({
        ...item,
        instance_name: item.instanceName ?? item.instance_name,
        instance_api_key: item.instanceApiKey ?? item.instance_api_key,
        qr_code: item.qrCode ?? item.qr_code,
        is_active: item.isActive ?? item.is_active,
      }));
    },
    enabled: !!companyId,
  });

  const callWhatsAppFunction = async (action: string, instanceId?: string, additionalData?: any) => {
    const { data, error } = await invokeFn('whatsapp-connect', {
      action,
      company_id: companyId,
      instance_id: instanceId,
      ...additionalData,
    });

    if (error) throw new Error(error);
    if (!data.success) throw new Error(data.message || data.error || 'Erro desconhecido');
    return data;
  };

  const updateInstanceInCache = (responseData: any) => {
    if (!responseData?.data) return;
    const d = responseData.data;
    queryClient.setQueryData(['whatsapp-instances', companyId], (old: any[] | undefined) => {
      const mapped = {
        ...d,
        instance_name: d.instanceName ?? d.instance_name,
        instance_api_key: d.instanceApiKey ?? d.instance_api_key,
        qr_code: d.qr_code ?? d.qrCode ?? d.qr_code,
        is_active: d.isActive ?? d.is_active ?? true,
      };
      if (!old) return [mapped];
      const idx = old.findIndex((i: any) => i.id === d.id);
      if (idx >= 0) {
        const updated = [...old];
        updated[idx] = { ...updated[idx], ...mapped };
        return updated;
      }
      return [...old, mapped];
    });
  };

  const connectMutation = useMutation({
    mutationFn: async () => callWhatsAppFunction('connect'),
    onSuccess: (data) => {
      updateInstanceInCache(data);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances', companyId] });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao conectar WhatsApp', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const reconnectMutation = useMutation({
    mutationFn: async (instanceId: string) => callWhatsAppFunction('reconnect', instanceId),
    onSuccess: (data) => {
      updateInstanceInCache(data);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances', companyId] });
      toast({ title: 'WhatsApp reconectando', description: data.message });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao reconectar WhatsApp', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (instanceId: string) => callWhatsAppFunction('disconnect', instanceId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances', companyId] });
      toast({ title: 'WhatsApp desconectado', description: data.message });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao desconectar WhatsApp', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (instanceId: string) => callWhatsAppFunction('delete', instanceId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances', companyId] });
      toast({ title: 'Instância excluída', description: data.message });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao excluir instância', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (instanceId: string) => callWhatsAppFunction('update', instanceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances', companyId] });
    },
    onError: (error: any) => {
      // Polling falhar e benigno (instancia recriada, provider offline, etc).
      // Logamos warn em vez de error pra nao poluir telemetria.
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
