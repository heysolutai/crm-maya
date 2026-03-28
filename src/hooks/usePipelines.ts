import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { toast } from '@/hooks/use-toast';

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  description: string | null;
  color: string;
  order_position: number;
  is_default: boolean;
  is_final: boolean;
  created_at: string;
  updated_at: string;
}

export interface Pipeline {
  id: string;
  company_id: string;
  department_id: string | null;
  name: string;
  description: string | null;
  color: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department?: { id: string; name: string; color: string } | null;
  pipeline_stages?: PipelineStage[];
}

function mapPipeline(raw: any): Pipeline {
  return {
    id: raw.id,
    company_id: raw.companyId ?? raw.company_id,
    department_id: raw.departmentId ?? raw.department_id,
    name: raw.name,
    description: raw.description,
    color: raw.color,
    is_default: raw.isDefault ?? raw.is_default,
    is_active: raw.isActive ?? raw.is_active,
    created_at: raw.createdAt ?? raw.created_at,
    updated_at: raw.updatedAt ?? raw.updated_at,
    department: raw.department || null,
    pipeline_stages: (raw.stages ?? raw.pipeline_stages ?? []).map((s: any) => ({
      id: s.id,
      pipeline_id: s.pipelineId ?? s.pipeline_id,
      name: s.name,
      description: s.description,
      color: s.color,
      order_position: s.orderPosition ?? s.order_position,
      is_default: s.isDefault ?? s.is_default,
      is_final: s.isFinal ?? s.is_final,
      created_at: s.createdAt ?? s.created_at,
      updated_at: s.updatedAt ?? s.updated_at,
    })),
  };
}

export function usePipelines() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  const { data: pipelines = [], isLoading: loading } = useQuery({
    queryKey: ['pipelines', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const res = await fetch(`/api/pipelines?companyId=${companyId}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch pipelines');
      const data = await res.json();

      return (data || []).map(mapPipeline) as Pipeline[];
    },
    enabled: !!companyId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pipelines', companyId] });

  const createPipeline = async (data: {
    name: string;
    description?: string;
    color?: string;
    department_id?: string | null;
    stages?: { name: string; color?: string }[];
  }) => {
    if (!companyId) return null;
    if (!data.name?.trim()) {
      toast({ title: 'Erro', description: 'Nome é obrigatório', variant: 'destructive' });
      return null;
    }

    try {
      const res = await fetch('/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          name: data.name.trim(),
          description: data.description?.trim() || null,
          color: data.color || '#10b981',
          department_id: data.department_id || null,
          stages: data.stages,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create pipeline');
      const pipeline = await res.json();

      toast({ title: 'Pipeline criado', description: 'Pipeline adicionado com sucesso!' });
      invalidate();
      return pipeline;
    } catch (error: any) {
      toast({ title: 'Erro ao criar pipeline', description: error.message, variant: 'destructive' });
      return null;
    }
  };

  const updatePipeline = async (id: string, data: Partial<Pipeline>) => {
    try {
      const { department, pipeline_stages, ...updateData } = data as any;
      const res = await fetch('/api/pipelines', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updateData }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update pipeline');

      toast({ title: 'Pipeline atualizado', description: 'Alterações salvas com sucesso!' });
      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  const deletePipeline = async (id: string) => {
    try {
      const pipeline = pipelines.find(p => p.id === id);
      if (pipeline?.is_default) {
        toast({ title: 'Erro', description: 'Não é possível excluir o pipeline padrão', variant: 'destructive' });
        return false;
      }

      const res = await fetch(`/api/pipelines?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete pipeline');

      toast({ title: 'Pipeline removido', description: 'Pipeline desativado com sucesso!' });
      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  return {
    pipelines,
    loading,
    createPipeline,
    updatePipeline,
    deletePipeline,
    refetch: invalidate,
  };
}
