import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { useToast } from './use-toast';
import type { ChannelType } from '@/lib/channels/types';

export type InboxStatus = 'connected' | 'connecting' | 'disconnected' | 'error' | string | null;

export interface Inbox {
  id: string;
  company_id: string;
  channel_type: ChannelType;
  display_name: string;
  phone_number: string | null;
  instance_name: string;
  api_url: string | null;
  instance_api_key: string | null;
  status: InboxStatus;
  is_active: boolean;
  qr_code: string | null;
  error_message: string | null;
  last_connected_at: string | null;
  metadata: Record<string, unknown> | null;
  channel_config: Record<string, unknown> | null;
  ai_agent_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useInboxes() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: inboxes, isLoading } = useQuery<Inbox[]>({
    queryKey: ['inboxes', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/agents?companyId=${companyId}`);
      if (!res.ok) throw new Error('Falha ao buscar caixas de entrada');
      const data = await res.json();
      // Normalize ai_agent_id (camelCase from Prisma)
      return (data || []).map((item: any) => ({
        ...item,
        ai_agent_id: item.aiAgentId ?? item.ai_agent_id ?? null,
      })) as Inbox[];
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: {
      channelType: ChannelType;
      displayName: string;
      serverUrl?: string;
      serverApiKey?: string;
      phoneNumber?: string;
      extra?: Record<string, unknown>;
      aiAgentId?: string;
      createAiAgentNamed?: string;
      /** 'create' provisiona instancia nova; 'existing' adota uma pelo token. */
      mode?: 'create' | 'existing';
      instanceToken?: string;
      restaurantId?: string;
    }) => {
      const res = await fetch(`/api/agents?companyId=${companyId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        const err = new Error(json.error || 'Falha ao criar caixa de entrada') as Error & { code?: string };
        err.code = json.code;
        throw err;
      }
      return json as Inbox;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
      toast({ title: 'Caixa de entrada criada' });
    },
    onError: (e: Error & { code?: string }) => {
      // Mensagens amigaveis por codigo de erro do canal
      const titleByCode: Record<string, string> = {
        INVALID_CREDENTIALS: 'API Key inválida',
        NETWORK_ERROR: 'Não foi possível conectar ao servidor',
        PROVIDER_UNREACHABLE: 'Servidor offline',
        CONFLICT: 'Instância já existe',
        BAD_REQUEST: 'Dados inválidos',
        RATE_LIMITED: 'Muitas tentativas, aguarde',
      };
      toast({
        title: (e.code && titleByCode[e.code]) || 'Erro ao criar caixa de entrada',
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; displayName?: string; isActive?: boolean; aiAgentId?: string | null }) => {
      const res = await fetch(`/api/agents?companyId=${companyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao atualizar');
      return json as Inbox;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
      toast({ title: 'Caixa de entrada atualizada' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao atualizar', description: e.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/agents?id=${id}&companyId=${companyId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao remover');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
      toast({ title: 'Caixa de entrada removida' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao remover', description: e.message, variant: 'destructive' });
    },
  });

  return {
    inboxes: inboxes || [],
    isLoading,
    createInbox: createMutation.mutate,
    updateInbox: updateMutation.mutate,
    deleteInbox: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

/**
 * Retorna o AiAgent linkado a uma inbox especifica (lookup via inbox.ai_agent_id).
 */
export function useInboxAiAgent(inboxId: string | undefined) {
  return useQuery({
    queryKey: ['inbox-ai-agent', inboxId],
    queryFn: async () => {
      if (!inboxId) return null;
      const res = await fetch(`/api/ai-configurations?agentId=${inboxId}`);
      if (!res.ok) return null;
      const data = await res.json();
      const item = (Array.isArray(data) ? data : [])[0];
      if (!item) return null;
      return {
        id: item.id,
        name: item.name,
        company_id: item.companyId ?? item.company_id,
        is_active: item.isActive ?? item.is_active,
      };
    },
    enabled: !!inboxId,
  });
}
