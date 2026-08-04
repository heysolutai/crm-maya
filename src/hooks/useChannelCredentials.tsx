import { apiFetch } from '@/lib/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { useToast } from './use-toast';
import type { ChannelType } from '@/lib/channels/types';

export interface ChannelCredential {
  id: string;
  company_id: string;
  channel_type: ChannelType;
  server_url: string;
  server_api_key: string; // mascarado por padrao
  has_credential: true;
  created_at: string;
  updated_at: string;
}

export function useChannelCredentials() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ChannelCredential[]>({
    queryKey: ['channel-credentials', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await apiFetch(`/api/channel-credentials`);
      if (!res.ok) throw new Error('Falha ao buscar credenciais');
      return res.json();
    },
    enabled: !!companyId,
  });

  const upsertMutation = useMutation({
    mutationFn: async (input: { channelType: ChannelType; serverUrl: string; serverApiKey: string }) => {
      const res = await apiFetch('/api/channel-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao salvar credencial');
      return json as ChannelCredential;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-credentials'] });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao salvar credencial', description: e.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (channelType: ChannelType) => {
      const res = await apiFetch(`/api/channel-credentials?channelType=${channelType}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Falha ao remover credencial');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-credentials'] });
      toast({ title: 'Credencial removida' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao remover credencial', description: e.message, variant: 'destructive' });
    },
  });

  /** Verifica se ja existe credencial salva pra um canal especifico */
  const hasCredentialFor = (channelType: ChannelType): boolean =>
    !!(data || []).find((c) => c.channel_type === channelType);

  /** Retorna a credencial salva (com token mascarado) — pra exibir no UI */
  const credentialFor = (channelType: ChannelType): ChannelCredential | undefined =>
    (data || []).find((c) => c.channel_type === channelType);

  return {
    credentials: data || [],
    isLoading,
    hasCredentialFor,
    credentialFor,
    upsertCredential: upsertMutation.mutate,
    deleteCredential: deleteMutation.mutate,
    isSaving: upsertMutation.isPending,
  };
}
