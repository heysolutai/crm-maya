import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { toast } from '@/hooks/use-toast';

export function useApiKeys(companyId: string) {
  const queryClient = useQueryClient();

  // Fetch API keys
  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['api-keys', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Create API key
  const createApiKey = useMutation({
    mutationFn: async (name: string) => {
      // Gerar chave no formato: sk_companyid_randomhash
      const randomHash = crypto.randomUUID().replace(/-/g, '');
      const key = `sk_${companyId.substring(0, 8)}_${randomHash}`;

      const { data, error } = await supabase
        .from('api_keys')
        .insert({
          company_id: companyId,
          name,
          key,
          is_active: true,
          created_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', companyId] });
      toast({ 
        title: 'API Key criada com sucesso!',
        description: 'A chave foi gerada e está pronta para uso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao criar API Key',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete API key
  const deleteApiKey = useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', companyId] });
      toast({ 
        title: 'API Key removida',
        description: 'A chave foi excluída permanentemente.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao remover API Key',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Toggle active status
  const toggleApiKeyStatus = useMutation({
    mutationFn: async ({ keyId, isActive }: { keyId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: !isActive })
        .eq('id', keyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', companyId] });
      toast({ 
        title: 'Status atualizado',
        description: 'O status da API Key foi alterado.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar status',
        description: error.message,
        variant: 'destructive',
      });
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
