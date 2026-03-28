import { useQuery, useQueryClient } from '@tanstack/react-query';
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

function mapStage(raw: any): PipelineStage {
  return {
    id: raw.id,
    pipeline_id: raw.pipelineId ?? raw.pipeline_id,
    name: raw.name,
    description: raw.description,
    color: raw.color,
    order_position: raw.orderPosition ?? raw.order_position,
    is_default: raw.isDefault ?? raw.is_default,
    is_final: raw.isFinal ?? raw.is_final,
    created_at: raw.createdAt ?? raw.created_at,
    updated_at: raw.updatedAt ?? raw.updated_at,
  };
}

export function usePipelineStages(pipelineId: string | null) {
  const queryClient = useQueryClient();

  const { data: stages = [], isLoading: loading } = useQuery({
    queryKey: ['pipeline-stages', pipelineId],
    queryFn: async () => {
      if (!pipelineId) return [];

      const res = await fetch(`/api/pipeline-stages?pipelineId=${pipelineId}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch stages');
      const data = await res.json();
      return (data || []).map(mapStage) as PipelineStage[];
    },
    enabled: !!pipelineId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pipeline-stages', pipelineId] });

  const createStage = async (data: { name: string; color?: string; order_position: number; is_default?: boolean; is_final?: boolean }) => {
    if (!pipelineId) return null;
    if (!data.name?.trim()) {
      toast({ title: 'Erro', description: 'Nome é obrigatório', variant: 'destructive' });
      return null;
    }

    try {
      const res = await fetch('/api/pipeline-stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_id: pipelineId,
          name: data.name.trim(),
          color: data.color || '#6366f1',
          order_position: data.order_position,
          is_default: data.is_default || false,
          is_final: data.is_final || false,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create stage');
      const stage = await res.json();

      toast({ title: 'Stage criada', description: 'Stage adicionada com sucesso!' });
      invalidate();
      return stage;
    } catch (error: any) {
      toast({ title: 'Erro ao criar stage', description: error.message, variant: 'destructive' });
      return null;
    }
  };

  const updateStage = async (id: string, data: Partial<PipelineStage>) => {
    try {
      const res = await fetch('/api/pipeline-stages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update stage');

      toast({ title: 'Stage atualizada', description: 'Alterações salvas com sucesso!' });
      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar stage', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  const deleteStage = async (id: string) => {
    try {
      // Move clients to first remaining stage
      const remaining = stages.filter(s => s.id !== id);
      const fallbackStageId = remaining.length > 0 ? remaining[0].id : '';

      const res = await fetch(`/api/pipeline-stages?id=${id}&fallbackStageId=${fallbackStageId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete stage');

      toast({ title: 'Stage removida', description: 'Stage excluída com sucesso!' });
      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao remover stage', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  const reorderStages = async (orderedIds: string[]) => {
    try {
      const res = await fetch('/api/pipeline-stages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to reorder stages');

      toast({ title: 'Stages reordenadas', description: 'Ordem atualizada com sucesso!' });
      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao reordenar', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  return {
    stages,
    loading,
    createStage,
    updateStage,
    deleteStage,
    reorderStages,
    refetch: invalidate,
  };
}
