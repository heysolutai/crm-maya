import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase-functions-adapter';
import { useToast } from './use-toast';
import { Json } from '@/types/database';
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
  settings: Json | null;
  whatsapp_phone?: string | null;
}

export function useCompanies() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: companies, isLoading, error } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch WhatsApp connected phones
      const { data: waInstances } = await supabase
        .from('whatsapp_instances')
        .select('company_id, metadata');

      const phoneMap = new Map<string, string>();
      if (waInstances) {
        for (const inst of waInstances) {
          const phone = (inst.metadata as any)?.connected_phone;
          if (phone && typeof phone === 'string' && phone.length >= 10) {
            phoneMap.set(inst.company_id, phone);
          }
        }
      }

      return (data as Company[]).map(c => ({
        ...c,
        whatsapp_phone: phoneMap.get(c.id) || null,
      }));
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

      if (error) {
        throw new Error(error);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({ title: 'Empresa criada com sucesso!' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao criar empresa',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const updateCompany = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Company> }) => {
      const { data, error } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({ title: 'Empresa atualizada com sucesso!' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar empresa',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteCompany = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_company_cascade', {
        p_company_id: id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({ title: 'Empresa excluída com sucesso!' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao excluir empresa',
        description: error.message,
        variant: 'destructive',
      });
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
