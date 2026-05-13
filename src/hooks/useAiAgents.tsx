import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { useToast } from './use-toast';

export interface AiAgent {
  id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function mapAiAgent(item: any): AiAgent {
  return {
    id: item.id,
    company_id: item.companyId ?? item.company_id,
    name: item.name,
    is_active: item.isActive ?? item.is_active ?? true,
    created_at: item.createdAt ?? item.created_at,
    updated_at: item.updatedAt ?? item.updated_at,
  };
}

export function useAiAgents() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: aiAgents, isLoading } = useQuery<AiAgent[]>({
    queryKey: ['ai-agents', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/ai-configurations?companyId=${companyId}`);
      if (!res.ok) throw new Error('Falha ao buscar agentes IA');
      const data = await res.json();
      return (data || []).map(mapAiAgent);
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; isActive?: boolean }) => {
      if (!companyId) throw new Error('Empresa não selecionada');
      const res = await fetch('/api/ai-configurations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          name: data.name,
          is_active: data.isActive ?? true,
          prompts: {},
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao criar agente IA');
      return mapAiAgent(json);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      queryClient.invalidateQueries({ queryKey: ['ai-configurations'] });
      toast({ title: 'Agente IA criado' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao criar agente IA', description: e.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; name?: string; isActive?: boolean }) => {
      const res = await fetch('/api/ai-configurations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao atualizar agente IA');
      return mapAiAgent(json);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      queryClient.invalidateQueries({ queryKey: ['ai-configurations'] });
      toast({ title: 'Agente IA atualizado' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao atualizar agente IA', description: e.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/ai-configurations?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Falha ao remover agente IA');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      queryClient.invalidateQueries({ queryKey: ['ai-configurations'] });
      toast({ title: 'Agente IA removido' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao remover agente IA', description: e.message, variant: 'destructive' });
    },
  });

  return {
    aiAgents: aiAgents || [],
    isLoading,
    createAiAgent: createMutation.mutate,
    createAiAgentAsync: createMutation.mutateAsync,
    updateAiAgent: updateMutation.mutate,
    deleteAiAgent: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
