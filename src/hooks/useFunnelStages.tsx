import { apiFetch } from '@/lib/api/client';
import { useState, useEffect } from 'react';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { toast } from '@/hooks/use-toast';

export interface FunnelStage {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  order_position: number;
  color: string;
  is_default: boolean;
  is_final: boolean;
  created_at: string;
  updated_at: string;
}

export function useFunnelStages() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStages = async () => {
    if (!companyId) return;

    setLoading(true);
    try {
      const res = await apiFetch(`/api/funnel-stages?companyId=${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch stages');
      const data = await res.json();
      // Normalize Prisma camelCase to snake_case
      setStages((data || []).map((s: any) => ({
        ...s,
        company_id: s.companyId || s.company_id,
        order_position: s.orderPosition ?? s.order_position,
        is_default: s.isDefault ?? s.is_default,
        is_final: s.isFinal ?? s.is_final,
        created_at: s.createdAt || s.created_at,
        updated_at: s.updatedAt || s.updated_at,
      })));
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar stages',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const createStage = async (stageData: Partial<FunnelStage>) => {
    if (!companyId) return null;
    if (!stageData.name || stageData.order_position === undefined) {
      toast({ title: 'Erro', description: 'Nome e ordem são obrigatórios', variant: 'destructive' });
      return null;
    }

    try {
      const res = await apiFetch('/api/funnel-stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...stageData,
          company_id: companyId,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create stage');
      }
      const data = await res.json();

      toast({ title: 'Stage criado', description: 'Stage adicionado com sucesso!' });
      fetchStages();
      return data;
    } catch (error: any) {
      toast({ title: 'Erro ao criar stage', description: error.message, variant: 'destructive' });
      return null;
    }
  };

  const updateStage = async (id: string, stageData: Partial<FunnelStage>) => {
    try {
      const res = await apiFetch('/api/funnel-stages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...stageData }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update stage');
      }

      toast({ title: 'Stage atualizado', description: 'Alterações salvas com sucesso!' });
      fetchStages();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar stage', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  const deleteStage = async (id: string) => {
    try {
      const res = await apiFetch(`/api/funnel-stages?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete stage');
      }

      toast({ title: 'Stage removido', description: 'Stage excluído com sucesso!' });
      fetchStages();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao remover stage', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  useEffect(() => {
    fetchStages();
  }, [companyId]);

  return {
    stages,
    loading,
    fetchStages,
    createStage,
    updateStage,
    deleteStage,
  };
}
