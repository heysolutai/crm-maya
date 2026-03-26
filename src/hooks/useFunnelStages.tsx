import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
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
      const { data, error } = await supabase
        .from('funnel_stages')
        .select('*')
        .eq('company_id', companyId)
        .order('order_position', { ascending: true });

      if (error) throw error;
      setStages(data || []);
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
      const { data, error } = await supabase
        .from('funnel_stages')
        .insert([{ 
          ...stageData, 
          company_id: companyId,
          name: stageData.name,
          order_position: stageData.order_position
        }])
        .select()
        .single();

      if (error) throw error;
      
      toast({
        title: 'Stage criado',
        description: 'Stage adicionado com sucesso!',
      });
      
      fetchStages();
      return data;
    } catch (error: any) {
      toast({
        title: 'Erro ao criar stage',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }
  };

  const updateStage = async (id: string, stageData: Partial<FunnelStage>) => {
    try {
      const { error } = await supabase
        .from('funnel_stages')
        .update(stageData)
        .eq('id', id);

      if (error) throw error;
      
      toast({
        title: 'Stage atualizado',
        description: 'Alterações salvas com sucesso!',
      });
      
      fetchStages();
      return true;
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar stage',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
  };

  const deleteStage = async (id: string) => {
    try {
      const { error } = await supabase
        .from('funnel_stages')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast({
        title: 'Stage removido',
        description: 'Stage excluído com sucesso!',
      });
      
      fetchStages();
      return true;
    } catch (error: any) {
      toast({
        title: 'Erro ao remover stage',
        description: error.message,
        variant: 'destructive',
      });
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