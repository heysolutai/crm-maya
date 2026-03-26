import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';

const FUNNEL_COLORS = [
  'hsl(173, 80%, 40%)',
  'hsl(190, 75%, 42%)',
  'hsl(210, 70%, 50%)',
  'hsl(230, 65%, 55%)',
  'hsl(250, 60%, 60%)',
  'hsl(270, 55%, 55%)',
];

export function useDashboardMetrics(dateFrom?: Date, dateTo?: Date) {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();

  const from = dateFrom?.toISOString() ?? new Date(Date.now() - 86400000).toISOString();
  const to = dateTo?.toISOString() ?? new Date().toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-metrics', companyId, from, to],
    queryFn: async () => {
      if (!companyId) return null;

      // Run all queries in parallel
      const [
        clientsRes,
        allClientsRes,
        conversationsRes,
        appointmentsRes,
        stagesRes,
      ] = await Promise.all([
        // New clients in range
        supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .gte('created_at', from)
          .lte('created_at', to),

        // All clients with stage_id for funnel + conversion
        supabase
          .from('clients')
          .select('id, stage_id')
          .eq('company_id', companyId),

        // Conversations in range
        supabase
          .from('conversations')
          .select('id, ai_handled')
          .eq('company_id', companyId)
          .gte('created_at', from)
          .lte('created_at', to),

        // Appointments in range
        supabase
          .from('appointments')
          .select('id, status')
          .eq('company_id', companyId)
          .gte('scheduled_for', from)
          .lte('scheduled_for', to),

        // Funnel stages
        supabase
          .from('funnel_stages')
          .select('id, name, order_position, is_final')
          .eq('company_id', companyId)
          .order('order_position', { ascending: true }),
      ]);

      const newClients = clientsRes.count ?? 0;

      const allClients = allClientsRes.data ?? [];
      const conversations = conversationsRes.data ?? [];
      const appointments = appointmentsRes.data ?? [];
      const stages = stagesRes.data ?? [];

      const totalConversations = conversations.length;
      const aiConversations = conversations.filter(c => c.ai_handled).length;
      const aiPercentage = totalConversations > 0 ? (aiConversations / totalConversations) * 100 : 0;

      const totalAppointments = appointments.length;
      const noShowAppointments = appointments.filter(a => a.status === 'no_show').length;
      const noShowRate = totalAppointments > 0 ? (noShowAppointments / totalAppointments) * 100 : 0;

      const finalStage = stages.find(s => s.is_final);
      const convertedClients = finalStage ? allClients.filter(c => c.stage_id === finalStage.id).length : 0;
      const conversionRate = allClients.length > 0 ? (convertedClients / allClients.length) * 100 : 0;

      // Funnel data
      const funnelData = stages.map((stage, index) => ({
        name: stage.name,
        clientes: allClients.filter(c => c.stage_id === stage.id).length,
        fill: FUNNEL_COLORS[index % FUNNEL_COLORS.length],
      }));

      return {
        newClients,
        totalConversations,
        aiConversations,
        aiPercentage,
        totalAppointments,
        noShowRate,
        conversionRate,
        revenue: 0,
        salesCount: 0,
        funnelData,
      };
    },
    enabled: !!companyId,
    staleTime: 30000,
  });

  return {
    newClients: data?.newClients ?? 0,
    totalConversations: data?.totalConversations ?? 0,
    aiConversations: data?.aiConversations ?? 0,
    aiPercentage: data?.aiPercentage ?? 0,
    totalAppointments: data?.totalAppointments ?? 0,
    noShowRate: data?.noShowRate ?? 0,
    conversionRate: data?.conversionRate ?? 0,
    revenue: data?.revenue ?? 0,
    funnelData: data?.funnelData ?? [],
    monthlyRevenue: [],
    isLoading,
  };
}
