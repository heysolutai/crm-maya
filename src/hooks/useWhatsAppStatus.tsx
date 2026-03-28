import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeFn } from '@/lib/api-functions';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { toast } from 'sonner';

export type WhatsAppStatus = 'connected' | 'connecting' | 'disconnected' | 'error' | 'no_instance';

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
  is_active: boolean;
}

interface UseWhatsAppStatusResult {
  status: WhatsAppStatus;
  instance: WhatsAppInstance | null;
  isLoading: boolean;
  isSyncing: boolean;
  sync: () => void;
  lastSyncAt: Date | null;
}

const POLL_INTERVAL = 60000; // 60 seconds

export function useWhatsAppStatus(): UseWhatsAppStatusResult {
  const { effectiveCompanyId } = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const previousStatusRef = useRef<WhatsAppStatus | null>(null);
  const lastSyncRef = useRef<Date | null>(null);

  // Query to fetch WhatsApp instance from database
  const { data: instance, isLoading } = useQuery({
    queryKey: ['whatsapp-instance-status', effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return null;

      const res = await fetch(`/api/whatsapp-instances?companyId=${effectiveCompanyId}&activeOnly=true`);
      if (!res.ok) throw new Error('Failed to fetch WhatsApp instance');
      const instances = await res.json();

      // Get first active instance
      const inst = instances?.[0] || null;
      if (!inst) return null;

      return {
        id: inst.id,
        instance_name: inst.instanceName || inst.instance_name,
        status: inst.status,
        is_active: inst.isActive ?? inst.is_active,
      } as WhatsAppInstance;
    },
    enabled: !!effectiveCompanyId,
    staleTime: 30000,
  });

  // Mutation to sync status with UAZAPI
  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompanyId || !instance?.id) return null;

      const { data, error } = await invokeFn('whatsapp-connect', {
        action: 'update',
        company_id: effectiveCompanyId,
        instance_id: instance.id,
      });

      if (error) throw new Error(error);

      lastSyncRef.current = new Date();
      return data;
    },
    onSuccess: (data) => {
      if (data?.status) {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-instance-status', effectiveCompanyId] });
        queryClient.invalidateQueries({ queryKey: ['whatsapp-instances', effectiveCompanyId] });
      }
    },
    onError: (error) => {
      console.error('[useWhatsAppStatus] Failed to sync:', error);
    },
  });

  // Determine current status
  const getStatus = useCallback((): WhatsAppStatus => {
    if (!instance) return 'no_instance';

    const status = instance.status?.toLowerCase() || '';

    if (status === 'connected' || status === 'open') return 'connected';
    if (status === 'connecting' || status === 'qr_code' || status === 'waiting_qr') return 'connecting';
    if (status === 'error' || status === 'failed') return 'error';
    return 'disconnected';
  }, [instance]);

  const currentStatus = getStatus();

  // Notify when status changes to disconnected
  useEffect(() => {
    if (previousStatusRef.current === 'connected' && currentStatus === 'disconnected') {
      toast.error('WhatsApp desconectado!', {
        description: 'A conexão com o WhatsApp foi perdida. Vá em Configurações para reconectar.',
        duration: 10000,
      });
    }
    previousStatusRef.current = currentStatus;
  }, [currentStatus]);

  // Initial sync when instance is loaded
  useEffect(() => {
    if (instance?.id && !lastSyncRef.current) {
      syncMutation.mutate();
    }
  }, [instance?.id]);

  // Polling for status updates
  useEffect(() => {
    if (!instance?.id) return;

    const interval = setInterval(() => {
      syncMutation.mutate();
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [instance?.id]);

  return {
    status: currentStatus,
    instance: instance || null,
    isLoading,
    isSyncing: syncMutation.isPending,
    sync: () => syncMutation.mutate(),
    lastSyncAt: lastSyncRef.current,
  };
}
