import { apiFetch } from '@/lib/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

export function useApiKeys(companyId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['api-keys', companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/api-keys?companyId=${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch API keys');
      return await res.json();
    },
    enabled: !!companyId,
  });

  const createApiKey = useMutation({
    mutationFn: async (name: string) => {
      const randomHash = crypto.randomUUID().replace(/-/g, '');
      const key = `sk_${companyId.substring(0, 8)}_${randomHash}`;

      const res = await apiFetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, name, key }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create API key');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', companyId] });
      toast({
        title: 'API Key criada com sucesso!',
        description: 'A chave foi gerada e está pronta para uso.',
      });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao criar API Key', description: error.message, variant: 'destructive' });
    },
  });

  const deleteApiKey = useMutation({
    mutationFn: async (keyId: string) => {
      const res = await apiFetch(`/api/api-keys?id=${keyId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete API key');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', companyId] });
      toast({ title: 'API Key removida', description: 'A chave foi excluída permanentemente.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao remover API Key', description: error.message, variant: 'destructive' });
    },
  });

  const toggleApiKeyStatus = useMutation({
    mutationFn: async ({ keyId, isActive }: { keyId: string; isActive: boolean }) => {
      const res = await apiFetch('/api/api-keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: keyId, isActive: !isActive }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to toggle API key');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', companyId] });
      toast({ title: 'Status atualizado', description: 'O status da API Key foi alterado.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar status', description: error.message, variant: 'destructive' });
    },
  });

  return {
    apiKeys,
    isLoading,
    createApiKey: createApiKey.mutate,
    deleteApiKey: deleteApiKey.mutate,
    toggleApiKeyStatus: toggleApiKeyStatus.mutate,
    isCreating: createApiKey.isPending,
    isDeleting: deleteApiKey.isPending,
    isToggling: toggleApiKeyStatus.isPending,
  };
}
