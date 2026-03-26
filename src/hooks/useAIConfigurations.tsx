import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
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
}

export function useAIConfigurations(companyId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: configurations, isLoading } = useQuery({
    queryKey: ['ai-configurations', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('ai_configurations')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(item => {
        const rawPrompts = item.prompts as any || {};
        return {
          ...item,
          prompts: {
            // Preservar todos os campos existentes (incluindo prompt_completo)
            ...rawPrompts,
            // Fallbacks para campos legados
            persona: rawPrompts.persona || rawPrompts.main || '',
            behavior: rawPrompts.behavior || '',
            attendance_funnel: rawPrompts.attendance_funnel || rawPrompts.guidelines || rawPrompts.attendance || '',
            scheduling_funnel: rawPrompts.scheduling_funnel || rawPrompts.scheduling || '',
            business_rules: rawPrompts.business_rules || '',
            first_message: rawPrompts.first_message || '',
          } as Prompts,
          follow_up_stages: (item.follow_up_stages as any) || [],
          follow_up_enabled: item.follow_up_enabled ?? false,
          whatsapp_instance_id: item.whatsapp_instance_id || null,
          api_keys: (item.api_keys as any) || {},
          behavior_settings: {
            ...DEFAULT_BEHAVIOR_SETTINGS,
            ...(item.behavior_settings as any),
          } as BehaviorSettings,
          n8n_webhook_url: (item as any).n8n_webhook_url || null,
          knowledge: (item as any).knowledge || null,
        };
      }) as AIConfiguration[];
    },
    enabled: !!companyId,
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
      const { data: userData } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('ai_configurations')
        .insert({
          company_id: config.company_id,
          name: config.name,
          prompts: config.prompts as any,
          is_active: config.is_active,
          whatsapp_instance_id: config.whatsapp_instance_id || null,
          follow_up_stages: config.follow_up_stages as any,
          api_keys: config.api_keys as any,
          behavior_settings: config.behavior_settings as any,
          created_by: userData.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
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
      const updateData: any = { ...updates };
      
      // Convert JSONB fields to proper types
      if (updates.prompts) {
        updateData.prompts = updates.prompts as any;
      }
      if (updates.follow_up_stages) {
        updateData.follow_up_stages = updates.follow_up_stages as any;
      }
      if (updates.api_keys) {
        updateData.api_keys = updates.api_keys as any;
      }
      if (updates.behavior_settings) {
        updateData.behavior_settings = updates.behavior_settings as any;
      }
      
      // Convert empty string to null for UUID field
      if ('whatsapp_instance_id' in updateData) {
        updateData.whatsapp_instance_id = updateData.whatsapp_instance_id || null;
      }
      
      const { data, error } = await supabase
        .from('ai_configurations')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
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
      const { error } = await supabase
        .from('ai_configurations')
        .delete()
        .eq('id', id);

      if (error) throw error;
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
