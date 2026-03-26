import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface AIBuilderFormData {
  company_name: string;
  segment: string;
  products_services: string;
  agent_objective: string;
  tone: string;
  use_emojis: boolean;
  agent_name: string;
  business_hours: string;
  payment_methods: string;
  differentials: string;
  specific_rules: string;
  welcome_message: string;
  extra_info: string;
}

export function useAIBuilder() {
  const { effectiveCompanyId } = useEffectiveCompanyId();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: webhookUrl, isLoading: isLoadingWebhook } = useQuery({
    queryKey: ['ai-builder-webhook', effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return null;
      const { data, error } = await supabase
        .from('ai_configurations')
        .select('n8n_webhook_url')
        .eq('company_id', effectiveCompanyId)
        .not('n8n_webhook_url', 'is', null)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data?.n8n_webhook_url || null;
    },
    enabled: !!effectiveCompanyId,
  });

  const submitToWebhook = async (formData: AIBuilderFormData) => {
    if (!webhookUrl) {
      toast.error('Webhook N8N não configurado. Peça ao administrador para configurar.');
      return false;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        company_id: effectiveCompanyId,
        ...formData,
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Erro ao enviar: ${response.status}`);
      }

      toast.success('Agente IA enviado para geração com sucesso!');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Erro ao gerar agente IA');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    webhookUrl,
    isLoadingWebhook,
    isSubmitting,
    submitToWebhook,
  };
}
