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
      return await res.json();
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

  const connectMutation = useMutation({
    mutationFn: async () => callWhatsAppFunction('connect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances', companyId] });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao conectar WhatsApp', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const reconnectMutation = useMutation({
    mutationFn: async (instanceId: string) => callWhatsAppFunction('reconnect', instanceId),
    onSuccess: (data) => {
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
      console.error('Erro ao atualizar status:', error.message);
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
