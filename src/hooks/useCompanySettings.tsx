import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { useToast } from './use-toast';

export function useCompanySettings() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: company, isLoading } = useQuery({
    queryKey: ['company', companyId],
    queryFn: async () => {
      if (!companyId) return null;

      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const updateCompany = useMutation({
    mutationFn: async (updates: any) => {
      // Use API route to bypass RLS restrictions on companies table
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch('/api/company/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          company_id: companyId,
          settings: updates.settings,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Erro ao salvar configurações');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] });
      toast({ title: 'Empresa atualizada com sucesso' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar empresa',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    company,
    isLoading,
    updateCompany: updateCompany.mutateAsync,
  };
}
