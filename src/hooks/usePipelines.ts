import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
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

export function usePipelines() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  const { data: pipelines = [], isLoading: loading } = useQuery({
    queryKey: ['pipelines', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('pipelines')
        .select(`
          *,
          department:departments(id, name, color),
          pipeline_stages(id, name, color, order_position, is_default, is_final)
        `)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map((p: any) => ({
        ...p,
        pipeline_stages: (p.pipeline_stages || []).sort(
          (a: any, b: any) => a.order_position - b.order_position
        ),
      })) as Pipeline[];
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
      // Create pipeline
      const { data: pipeline, error } = await supabase
        .from('pipelines')
        .insert({
          company_id: companyId,
          name: data.name.trim(),
          description: data.description?.trim() || null,
          color: data.color || '#10b981',
          department_id: data.department_id || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Create stages
      const stages = data.stages && data.stages.length > 0
        ? data.stages.map((s, i) => ({
            pipeline_id: pipeline.id,
            name: s.name,
            color: s.color || '#6366f1',
            order_position: i + 1,
            is_default: i === 0,
            is_final: i === data.stages!.length - 1,
          }))
        : [
            { pipeline_id: pipeline.id, name: 'Novo', color: '#3b82f6', order_position: 1, is_default: true, is_final: false },
            { pipeline_id: pipeline.id, name: 'Em andamento', color: '#f59e0b', order_position: 2, is_default: false, is_final: false },
            { pipeline_id: pipeline.id, name: 'Concluído', color: '#10b981', order_position: 3, is_default: false, is_final: true },
          ];

      await supabase.from('pipeline_stages').insert(stages);

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
      const { error } = await supabase
        .from('pipelines')
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

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

      const { error } = await supabase
        .from('pipelines')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

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
