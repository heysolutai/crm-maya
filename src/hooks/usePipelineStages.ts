import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
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

export function usePipelineStages(pipelineId: string | null) {
  const queryClient = useQueryClient();

  const { data: stages = [], isLoading: loading } = useQuery({
    queryKey: ['pipeline-stages', pipelineId],
    queryFn: async () => {
      if (!pipelineId) return [];

      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('order_position', { ascending: true });

      if (error) throw error;
      return (data || []) as PipelineStage[];
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
      const { data: stage, error } = await supabase
        .from('pipeline_stages')
        .insert({
          pipeline_id: pipelineId,
          name: data.name.trim(),
          color: data.color || '#6366f1',
          order_position: data.order_position,
          is_default: data.is_default || false,
          is_final: data.is_final || false,
        })
        .select()
        .single();

      if (error) throw error;

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
      const { error } = await supabase
        .from('pipeline_stages')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

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
      if (remaining.length > 0) {
        await supabase
          .from('clients')
          .update({ stage_id: remaining[0].id })
          .eq('stage_id', id);
      }

      const { error } = await supabase
        .from('pipeline_stages')
        .delete()
        .eq('id', id);

      if (error) throw error;

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
      for (let i = 0; i < orderedIds.length; i++) {
        await supabase
          .from('pipeline_stages')
          .update({ order_position: i + 1, updated_at: new Date().toISOString() })
          .eq('id', orderedIds[i]);
      }

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
