import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase-functions-adapter';
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

      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, status, is_active')
        .eq('company_id', effectiveCompanyId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('[useWhatsAppStatus] Error fetching instance:', error);
        throw error;
      }

      return data as WhatsAppInstance | null;
    },
    enabled: !!effectiveCompanyId,
    staleTime: 30000, // Consider data stale after 30s
  });

  // Mutation to sync status with UAZAPI
  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompanyId || !instance?.id) {
        return null;
      }

      console.log('[useWhatsAppStatus] Syncing status for instance:', instance.instance_name);

      const { data, error } = await invokeFn('whatsapp-connect', {
          action: 'update',
          company_id: effectiveCompanyId,
          instance_id: instance.id,
        });

      if (error) {
        console.error('[useWhatsAppStatus] Sync error:', error);
        throw new Error(error);
      }

      lastSyncRef.current = new Date();
      return data;
    },
    onSuccess: (data) => {
      if (data?.status) {
        // Invalidate query to refetch updated status
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
    
    if (status === 'connected' || status === 'open') {
      return 'connected';
    } else if (status === 'connecting' || status === 'qr_code' || status === 'waiting_qr') {
      return 'connecting';
    } else if (status === 'error' || status === 'failed') {
      return 'error';
    } else {
      return 'disconnected';
    }
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
