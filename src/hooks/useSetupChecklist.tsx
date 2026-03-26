import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export type ChecklistStatus = 'red' | 'yellow' | 'green';

export interface ChecklistItem {
  id: number;
  label: string;
  status: ChecklistStatus;
  category: 'red' | 'yellow';
}

export function useSetupChecklist(companyId: string | undefined) {
  const { data: aiConfig } = useQuery({
    queryKey: ['setup-checklist-ai', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from('ai_configurations')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

  const { data: company } = useQuery({
    queryKey: ['setup-checklist-company', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from('companies')
        .select('settings')
        .eq('id', companyId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

  const { data: whatsappInstances } = useQuery({
    queryKey: ['setup-checklist-whatsapp', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('id, status, is_active')
        .eq('company_id', companyId);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: apiKeys } = useQuery({
    queryKey: ['setup-checklist-apikeys', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from('api_keys')
        .select('id, is_active')
        .eq('company_id', companyId)
        .eq('is_active', true);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: faqs } = useQuery({
    queryKey: ['setup-checklist-faqs', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from('company_faqs')
        .select('id, answer, is_active')
        .eq('company_id', companyId)
        .eq('is_active', true);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: googleCalendar } = useQuery({
    queryKey: ['setup-checklist-gcal', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from('google_calendar_connections')
        .select('id, is_active')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

  // Build checklist
  const prompts = (aiConfig?.prompts as any) || {};
  const apiKeysConfig = (aiConfig?.api_keys as any) || {};
  const behaviorSettings = (aiConfig?.behavior_settings as any) || {};
  const settings = (company?.settings as any) || {};
  const businessHours = settings?.business_hours;
  const appointmentSettings = settings?.appointment_settings;
  const followUpStages = (aiConfig?.follow_up_stages as any[]) || [];
  const followUpEnabled = aiConfig?.follow_up_enabled ?? false;

  const hasActiveWhatsapp = whatsappInstances?.some((i: any) => i.is_active) ?? false;
  const hasConnectedWhatsapp = whatsappInstances?.some((i: any) => i.status === 'connected' || i.status === 'open') ?? false;
  const hasAIApiKey = !!(apiKeysConfig.openai || apiKeysConfig.anthropic || apiKeysConfig.gemini);
  const hasProtectionApiKey = (apiKeys?.length ?? 0) > 0;
  const hasFAQsWithAnswers = faqs?.some((f: any) => f.answer && f.answer.trim().length > 0) ?? false;
  const hasBusinessHours = businessHours && Object.values(businessHours).some((d: any) => d?.enabled);
  const hasAppointmentSettings = !!(appointmentSettings?.default_duration_minutes);

  const hasText = (val: any) => typeof val === 'string' && val.trim().length > 0;

  const evaluate = (condition: boolean): ChecklistStatus => condition ? 'green' : 'red';
  const evaluateYellow = (condition: boolean): ChecklistStatus => condition ? 'green' : 'yellow';

  const items: ChecklistItem[] = [
    // RED items (1-13)
    { id: 1, label: 'Instância', status: evaluate(!!aiConfig?.whatsapp_instance_id), category: 'red' },
    { id: 2, label: 'Persona', status: evaluate(hasText(prompts.persona)), category: 'red' },
    { id: 3, label: 'Comportamento', status: evaluate(hasText(prompts.behavior)), category: 'red' },
    { id: 4, label: 'Funil de Atendimento', status: evaluate(hasText(prompts.attendance_funnel)), category: 'red' },
    { id: 5, label: 'Funil de Agendamento', status: evaluate(hasText(prompts.scheduling_funnel)), category: 'red' },
    { id: 6, label: 'Regras de Negócio', status: evaluate(hasText(prompts.business_rules)), category: 'red' },
    { id: 7, label: 'Boas Vindas', status: evaluate(hasText(prompts.first_message)), category: 'red' },
    { id: 8, label: 'Horário de Funcionamento', status: evaluate(hasBusinessHours), category: 'red' },
    { id: 9, label: 'Eventos', status: evaluate(hasAppointmentSettings), category: 'red' },
    { id: 10, label: 'WhatsApp', status: evaluate(hasActiveWhatsapp && hasConnectedWhatsapp), category: 'red' },
    { id: 11, label: 'API Key da IA', status: evaluate(hasAIApiKey), category: 'red' },
    { id: 12, label: 'API de Proteção', status: evaluate(hasProtectionApiKey), category: 'red' },
    { id: 13, label: 'FAQ', status: evaluate(hasFAQsWithAnswers), category: 'red' },
    // YELLOW items (14-17)
    { id: 14, label: 'Lembretes', status: evaluateYellow(!!(settings?.appointment_settings?.reminder_offsets?.length > 0)), category: 'yellow' },
    { id: 15, label: 'Follow Up', status: evaluateYellow(followUpEnabled && followUpStages.length > 0), category: 'yellow' },
    { id: 16, label: 'Google Calendário', status: evaluateYellow(!!googleCalendar), category: 'yellow' },
    { id: 17, label: 'Comportamento da IA', status: evaluateYellow(!!(behaviorSettings.preferred_model && behaviorSettings.language)), category: 'yellow' },
  ];

  const completedCount = items.filter(i => i.status === 'green').length;
  const totalCount = items.length;

  return { items, completedCount, totalCount };
}
