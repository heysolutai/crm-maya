import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

      const res = await fetch(`/api/companies?id=${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch company');
      return await res.json();
    },
    enabled: !!companyId,
  });

  const updateCompany = useMutation({
    mutationFn: async (updates: any) => {
      // Caso 1: update do JSON settings (lead_distribution, report_group, etc)
      if (updates && updates.settings && typeof updates.settings === 'object') {
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

      // Caso 2: update de campos de perfil (name, email, phone, etc)
      // Mapeia snake_case -> camelCase pro schema de /api/companies
      const fieldMap: Record<string, string> = {
        name: 'name',
        trade_name: 'tradeName',
        email: 'email',
        phone: 'phone',
        document_number: 'documentNumber',
        address: 'address',
      };
      const payload: Record<string, unknown> = { id: companyId };
      let hasField = false;
      for (const [snake, camel] of Object.entries(fieldMap)) {
        if (snake in updates && updates[snake] !== undefined) {
          payload[camel] = updates[snake];
          hasField = true;
        }
      }
      if (!hasField) return { success: true };

      const res = await fetch('/api/companies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Erro ao atualizar empresa');
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
