import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from './use-toast';
import {
  DEFAULT_BEHAVIOR_SETTINGS,
  DEFAULT_PROMPTS,
  type BehaviorSettings,
  type Prompts
} from '@/lib/aiConfig';

// Re-export types from aiConfig for backwards compatibility
export type { BehaviorSettings, Prompts } from '@/lib/aiConfig';

export interface FollowUpStage {
  order: number;
  delay_hours: number;
  message: string;
  enabled?: boolean;
}

export interface APIKeys {
  openai?: string;
  gemini?: string;
  elevenlabs?: string;
  elevenlabs_voice_id?: string;
  anthropic?: string;
  // ElevenLabs audio settings
  elevenlabs_stability?: number;
  elevenlabs_similarity?: number;
  elevenlabs_style?: number;
  elevenlabs_speaker_boost?: boolean;
  elevenlabs_remove_background_noise?: boolean;
}

export interface AIConfiguration {
  id: string;
  company_id: string;
  name: string;
  prompts: Prompts;
  is_active: boolean;
  conditions: any;
  variables: any;
  created_at: string;
  updated_at: string;
  whatsapp_instance_id: string | null;
  follow_up_stages: FollowUpStage[];
  follow_up_enabled: boolean;
  api_keys: APIKeys;
  behavior_settings: BehaviorSettings;
  n8n_webhook_url: string | null;
  knowledge: string | null;
  memory_key: string | null;
  products_knowledge: string | null;
}

function mapConfig(item: any): AIConfiguration {
  const rawPrompts = (item.prompts as any) || {};
  return {
    id: item.id,
    company_id: item.companyId ?? item.company_id,
    name: item.name,
    is_active: item.isActive ?? item.is_active,
    conditions: item.conditions,
    variables: item.variables,
    created_at: item.createdAt ?? item.created_at,
    updated_at: item.updatedAt ?? item.updated_at,
    whatsapp_instance_id: item.whatsappInstanceId ?? item.whatsapp_instance_id ?? null,
    follow_up_stages: (item.followUpStages ?? item.follow_up_stages ?? []) as FollowUpStage[],
    follow_up_enabled: item.followUpEnabled ?? item.follow_up_enabled ?? false,
    api_keys: (item.apiKeys ?? item.api_keys ?? {}) as APIKeys,
    behavior_settings: {
      ...DEFAULT_BEHAVIOR_SETTINGS,
      ...(item.behaviorSettings ?? item.behavior_settings ?? {}),
    } as BehaviorSettings,
    n8n_webhook_url: item.n8nWebhookUrl ?? item.n8n_webhook_url ?? null,
    knowledge: item.knowledge ?? null,
    memory_key: item.memoryKey ?? item.memory_key ?? null,
    products_knowledge: item.productsKnowledge ?? item.products_knowledge ?? null,
    prompts: {
      // Preserve all existing fields (including prompt_completo)
      ...rawPrompts,
      // Fallbacks for legacy fields
      persona: rawPrompts.persona || rawPrompts.main || '',
      behavior: rawPrompts.behavior || '',
      attendance_funnel: rawPrompts.attendance_funnel || rawPrompts.guidelines || rawPrompts.attendance || '',
      scheduling_funnel: rawPrompts.scheduling_funnel || rawPrompts.scheduling || '',
      business_rules: rawPrompts.business_rules || '',
      first_message: rawPrompts.first_message || '',
    } as Prompts,
  };
}

/**
 * Hook agora aceita 2 modos:
 * - useAIConfigurations(companyId)            → modo legado, lista todas configs da empresa
 * - useAIConfigurations({ agentId })          → modo agente, retorna a config 1:1 do agente
 * - useAIConfigurations({ companyId, agentId })→ explicita ambos (idem ao agentId)
 *
 * Sempre retorna `configurations: AIConfiguration[]` pra preservar a API
 * dos componentes que ja usam configurations[0].
 */
export function useAIConfigurations(
  arg: string | undefined | { companyId?: string; agentId?: string }
) {
  const companyId = typeof arg === 'string' ? arg : arg?.companyId;
  const agentId = typeof arg === 'string' ? undefined : arg?.agentId;

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: configurations, isLoading } = useQuery({
    queryKey: ['ai-configurations', companyId, agentId],
    queryFn: async () => {
      if (!companyId && !agentId) return [];

      const params = new URLSearchParams();
      if (companyId) params.set('companyId', companyId);
      if (agentId) params.set('agentId', agentId);

      const res = await fetch(`/api/ai-configurations?${params}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch configurations');
      const data = await res.json();
      return (data || []).map(mapConfig) as AIConfiguration[];
    },
    enabled: !!(companyId || agentId),
  });

  const createConfiguration = useMutation({
    mutationFn: async (config: {
      company_id: string;
      name: string;
      prompts: Prompts;
      is_active?: boolean;
      whatsapp_instance_id?: string | null;
      follow_up_stages?: FollowUpStage[];
      api_keys?: APIKeys;
      behavior_settings?: BehaviorSettings;
    }) => {
      const res = await fetch('/api/ai-configurations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create configuration');
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-configurations'] });
      toast({ title: 'Configuração criada com sucesso!' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao criar configuração',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateConfiguration = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AIConfiguration> }) => {
      const res = await fetch('/api/ai-configurations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update configuration');
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-configurations'] });
      toast({ title: 'Configuração atualizada com sucesso!' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar configuração',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteConfiguration = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/ai-configurations?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete configuration');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-configurations'] });
      toast({ title: 'Configuração deletada com sucesso!' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao deletar configuração',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    configurations,
    isLoading,
    createConfiguration: createConfiguration.mutate,
    isCreating: createConfiguration.isPending,
    updateConfiguration: updateConfiguration.mutate,
    isUpdating: updateConfiguration.isPending,
    deleteConfiguration: deleteConfiguration.mutate,
    isDeleting: deleteConfiguration.isPending,
  };
}
