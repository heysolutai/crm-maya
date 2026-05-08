import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

/**
 * Hook que mostra o status do WhatsApp na barra superior.
 *
 * Refatorado pra usar o novo flow multi-canal (/api/agents) em vez do
 * legado /api/whatsapp/connect — agora funciona pra UazAPI, Evolution, etc.
 *
 * Pega o PRIMEIRO agente ativo da empresa pra exibir um status agregado.
 * Pra status detalhado por agente, usar AgentDetail.
 */
export function useWhatsAppStatus(): UseWhatsAppStatusResult {
  const { effectiveCompanyId } = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const previousStatusRef = useRef<WhatsAppStatus | null>(null);
  const lastSyncRef = useRef<Date | null>(null);

  const { data: instance, isLoading } = useQuery({
    queryKey: ['whatsapp-instance-status', effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return null;

      const res = await fetch(`/api/agents?companyId=${effectiveCompanyId}`);
      if (!res.ok) return null;
      const agents = await res.json();

      // Pega o primeiro agente ativo (qualquer canal)
      const inst = (agents || []).find((a: any) => a.is_active) || agents?.[0] || null;
      if (!inst) return null;

      return {
        id: inst.id,
        instance_name: inst.display_name || inst.instance_name,
        status: inst.status || 'disconnected',
        is_active: inst.is_active,
      } as WhatsAppInstance;
    },
    enabled: !!effectiveCompanyId,
    staleTime: 30000,
  });

  // Sync chama /api/agents/[id]/status (adapter usa endpoint do canal certo).
  // Tolerante a 404 (agente removido) — apenas invalida e segue.
  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!instance?.id) return null;

      const res = await fetch(`/api/agents/${instance.id}/status`);
      if (res.status === 404) {
        // Agente sumiu — invalida o cache pra refetch da lista
        queryClient.invalidateQueries({ queryKey: ['whatsapp-instance-status'] });
        return null;
      }
      if (!res.ok) {
        // Erros transientes (rede/provider offline) sao silenciosos —
        // proximo poll tenta de novo. Sem barulho no console.
        return null;
      }

      lastSyncRef.current = new Date();
      return await res.json();
    },
    onSuccess: (data) => {
      if (data?.status) {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-instance-status', effectiveCompanyId] });
        queryClient.invalidateQueries({ queryKey: ['agents', effectiveCompanyId] });
      }
    },
    // Sem onError ruidoso — sync falhar e normal quando provider esta offline
  });

  const getStatus = useCallback((): WhatsAppStatus => {
    if (!instance) return 'no_instance';

    const status = instance.status?.toLowerCase() || '';

    if (status === 'connected' || status === 'open') return 'connected';
    if (status === 'connecting' || status === 'qr_code' || status === 'waiting_qr' || status === 'qrcode') return 'connecting';
    if (status === 'error' || status === 'failed') return 'error';
    return 'disconnected';
  }, [instance]);

  const currentStatus = getStatus();

  useEffect(() => {
    if (previousStatusRef.current === 'connected' && currentStatus === 'disconnected') {
      toast.error('WhatsApp desconectado!', {
        description: 'A conexão foi perdida. Vá em Agentes para reconectar.',
        duration: 10000,
      });
    }
    previousStatusRef.current = currentStatus;
  }, [currentStatus]);

  useEffect(() => {
    if (instance?.id && !lastSyncRef.current) {
      syncMutation.mutate();
    }
  }, [instance?.id]);

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
