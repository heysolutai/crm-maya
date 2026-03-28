import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface CompanyUpdate {
  name?: string;
  email?: string;
  phone?: string;
  document_number?: string;
  trade_name?: string;
  is_active?: boolean;
  settings?: any;
  metadata?: any;
}

export function useCompanyDetails(companyId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: company, isLoading, error } = useQuery({
    queryKey: ['company', companyId],
    queryFn: async () => {
      if (!companyId) return null;

      const res = await fetch(`/api/companies?id=${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch company');
      return await res.json();
    },
    enabled: !!companyId,
  });

  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['company-users', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const res = await fetch(`/api/company-details?companyId=${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch company users');
      const data = await res.json();
      return data.users || [];
    },
    enabled: !!companyId,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: CompanyUpdate) => {
      if (!companyId) throw new Error('Company ID is required');

      if (updates.settings) {
        const res = await fetch('/api/company/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
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

      // For non-settings updates
      const res = await fetch('/api/companies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: companyId, ...updates }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update company');
      }
      return await res.json();
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
