import { apiFetch } from '@/lib/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeFn } from '@/lib/api-functions';
import { useToast } from './use-toast';
import { getErrorMessage } from '@/utils/getErrorMessage';

export interface Company {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  trade_name: string | null;
  subscription_status: 'trial' | 'active' | 'cancelled' | 'suspended';
  trial_ends_at: string | null;
  subscription_expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  whatsapp_instance_name: string | null;
  settings: any | null;
  whatsapp_phone?: string | null;
}

export function useCompanies() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: companies, isLoading, error } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await apiFetch('/api/companies');
      if (!res.ok) throw new Error('Failed to fetch companies');
      const data = await res.json();
      return (data || []).map((c: any) => ({
        ...c,
        trade_name: c.tradeName || c.trade_name,
        subscription_status: c.subscriptionStatus || c.subscription_status,
        trial_ends_at: c.trialEndsAt || c.trial_ends_at,
        subscription_expires_at: c.subscriptionExpiresAt || c.subscription_expires_at,
        is_active: c.isActive ?? c.is_active,
        created_at: c.createdAt || c.created_at,
        updated_at: c.updatedAt || c.updated_at,
        whatsapp_instance_name: c.whatsappInstanceName || c.whatsapp_instance_name,
        whatsapp_phone: c.whatsapp_phone || null,
      })) as Company[];
    },
  });

  const createCompany = useMutation({
    mutationFn: async (params: {
      companyName: string;
      ownerEmail: string;
      ownerFullName?: string;
      ownerPassword?: string;
    }) => {
      const { data, error } = await invokeFn('create-company-with-owner', params);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({ title: 'Empresa criada com sucesso!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao criar empresa', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const updateCompany = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Company> }) => {
      const res = await apiFetch('/api/companies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update company');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({ title: 'Empresa atualizada com sucesso!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar empresa', description: error.message, variant: 'destructive' });
    },
  });

  const deleteCompany = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/companies?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete company');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({ title: 'Empresa excluída com sucesso!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao excluir empresa', description: error.message, variant: 'destructive' });
    },
  });

  return {
    companies,
    isLoading,
    error,
    createCompany: createCompany.mutate,
    createCompanyAsync: createCompany.mutateAsync,
    isCreating: createCompany.isPending,
    updateCompany: updateCompany.mutate,
    isUpdating: updateCompany.isPending,
    deleteCompany: deleteCompany.mutate,
    isDeleting: deleteCompany.isPending,
  };
}
