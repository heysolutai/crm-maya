import { apiFetch } from '@/lib/api/client';
import { useState } from 'react';
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
      const res = await apiFetch(`/api/ai-builder?companyId=${effectiveCompanyId}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch webhook');
      const data = await res.json();
      return data?.webhookUrl || null;
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
