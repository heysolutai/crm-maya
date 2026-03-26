import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Json } from '@/types/database';

interface CompanyUpdate {
  name?: string;
  email?: string;
  phone?: string;
  document_number?: string;
  trade_name?: string;
  is_active?: boolean;
  settings?: Json;
  metadata?: Json;
}

export function useCompanyDetails(companyId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: company, isLoading, error } = useQuery({
    queryKey: ['company', companyId],
    queryFn: async () => {
      if (!companyId) return null;

      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['company-users', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          user_roles!inner(role)
        `)
        .eq('company_id', companyId);

      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: CompanyUpdate) => {
      if (!companyId) throw new Error('Company ID is required');

      // Use API route to bypass RLS restrictions on companies table
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (updates.settings) {
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
      }

      // For non-settings updates, use direct supabase
      const { data, error } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', companyId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });

  return {
    company,
    users,
    isLoading,
    isLoadingUsers,
    error,
    updateCompany: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}
