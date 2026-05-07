import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { useToast } from './use-toast';
import type { ChannelType } from '@/lib/channels/types';

export type AgentStatus = 'connected' | 'connecting' | 'disconnected' | 'error' | string | null;

export interface Agent {
  id: string;
  company_id: string;
  channel_type: ChannelType;
  display_name: string;
  phone_number: string | null;
  instance_name: string;
  api_url: string | null;
  instance_api_key: string | null;
  status: AgentStatus;
  is_active: boolean;
  qr_code: string | null;
  error_message: string | null;
  last_connected_at: string | null;
  metadata: Record<string, unknown> | null;
  channel_config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export function useAgents() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ['agents', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/agents?companyId=${companyId}`);
      if (!res.ok) throw new Error('Falha ao buscar agentes');
      return res.json();
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
    }) => {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        const err = new Error(json.error || 'Falha ao criar agente') as Error & { code?: string };
        err.code = json.code;
        throw err;
      }
      return json as Agent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast({ title: 'Agente criado' });
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
        title: (e.code && titleByCode[e.code]) || 'Erro ao criar agente',
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; displayName?: string; isActive?: boolean }) => {
      const res = await fetch('/api/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao atualizar');
      return json as Agent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast({ title: 'Agente atualizado' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao atualizar', description: e.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/agents?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao remover');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast({ title: 'Agente removido' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao remover', description: e.message, variant: 'destructive' });
    },
  });

  return {
    agents: agents || [],
    isLoading,
    createAgent: createMutation.mutate,
    updateAgent: updateMutation.mutate,
    deleteAgent: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
