import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { format, startOfDay, endOfDay } from 'date-fns';

const FUNNEL_COLORS = [
  'hsl(173, 80%, 40%)', 'hsl(190, 75%, 42%)', 'hsl(210, 70%, 50%)',
  'hsl(230, 65%, 55%)', 'hsl(250, 60%, 60%)', 'hsl(270, 55%, 55%)',
  'hsl(290, 50%, 50%)', 'hsl(310, 55%, 50%)',
];

const DEPT_COLORS = [
  'hsl(150, 60%, 45%)', 'hsl(200, 70%, 50%)', 'hsl(260, 55%, 55%)',
  'hsl(30, 65%, 50%)', 'hsl(340, 55%, 50%)', 'hsl(80, 50%, 45%)',
];

const AGENT_COLORS = [
  'hsl(150, 60%, 45%)', 'hsl(190, 70%, 45%)', 'hsl(210, 65%, 50%)',
  'hsl(250, 55%, 55%)', 'hsl(280, 50%, 50%)', 'hsl(320, 55%, 50%)',
  'hsl(20, 65%, 50%)', 'hsl(40, 70%, 50%)', 'hsl(60, 60%, 45%)',
  'hsl(100, 55%, 45%)',
];

function computeTrend(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

function computeAvgResponseTime(
  messages: { conversation_id: string; sender_type: string; created_at: string }[]
): number {
  const byConversation = new Map<string, typeof messages>();
  for (const msg of messages) {
    const arr = byConversation.get(msg.conversation_id) ?? [];
    arr.push(msg);
    byConversation.set(msg.conversation_id, arr);
  }

  const responseTimes: number[] = [];
  for (const [, msgs] of byConversation) {
    const firstClient = msgs.find(m => m.sender_type === 'client');
    if (!firstClient) continue;
    const firstResponse = msgs.find(
      m =>
        (m.sender_type === 'agent' || m.sender_type === 'ai') &&
        new Date(m.created_at).getTime() > new Date(firstClient.created_at).getTime()
    );
    if (!firstResponse) continue;
    const diffMin =
      (new Date(firstResponse.created_at).getTime() - new Date(firstClient.created_at).getTime()) / 60000;
    if (diffMin > 0 && diffMin < 1440) responseTimes.push(diffMin);
  }

  return responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : 0;
}

export function useDashboardMetrics(dateFrom?: Date, dateTo?: Date) {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();

  const from = dateFrom?.toISOString() ?? new Date(Date.now() - 86400000).toISOString();
  const to = dateTo?.toISOString() ?? new Date().toISOString();

  const periodMs = (dateTo?.getTime() ?? Date.now()) - (dateFrom?.getTime() ?? Date.now() - 86400000);
  const prevFrom = new Date((dateFrom?.getTime() ?? Date.now() - 86400000) - periodMs).toISOString();
  const prevTo = new Date((dateFrom?.getTime() ?? Date.now() - 86400000) - 1).toISOString();

  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-metrics-v2', companyId, from, to],
    queryFn: async () => {
      if (!companyId) return null;

      const [
        clientsRes, convsRes, aptsRes, salesRes,
        prevClientsRes, prevSalesRes,
        msgsRes, usersRes, stagesRes, allClientsRes, deptsRes,
        activeConvsRes, todayAptsRes,
      ] = await Promise.all([
        // 1. New clients (current period)
        supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .gte('created_at', from)
          .lte('created_at', to),

        // 2. Conversations in period
        supabase
          .from('conversations')
          .select('id, ai_handled, department_id, transferred_to, assigned_to')
          .eq('company_id', companyId)
          .gte('created_at', from)
          .lte('created_at', to),

        // 3. Appointments in period
        supabase
          .from('appointments')
          .select('id, status, scheduled_for')
          .eq('company_id', companyId)
          .gte('scheduled_for', from)
          .lte('scheduled_for', to),

        // 4. Sales in period
        supabase
          .from('sales')
          .select('id, total_amount, created_at, sold_by')
          .eq('company_id', companyId)
          .gte('created_at', from)
          .lte('created_at', to),

        // 5. Previous clients (trend)
        supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .gte('created_at', prevFrom)
          .lte('created_at', prevTo),

        // 6. Previous sales (trend)
        supabase
          .from('sales')
          .select('total_amount')
          .eq('company_id', companyId)
          .gte('created_at', prevFrom)
          .lte('created_at', prevTo),

        // 7. Messages today (hourly chart + response time)
        supabase
          .from('messages')
          .select('id, created_at, sender_type, conversation_id, conversations!inner(company_id)')
          .eq('conversations.company_id', companyId)
          .gte('created_at', todayStart)
          .lte('created_at', todayEnd)
          .order('created_at', { ascending: true }),

        // 8. Users / agents
        supabase
          .from('users')
          .select('id, full_name, is_online')
          .eq('company_id', companyId)
          .eq('is_active', true),

        // 9. Funnel stages
        supabase
          .from('funnel_stages')
          .select('id, name, order_position, is_final')
          .eq('company_id', companyId)
          .order('order_position', { ascending: true }),

        // 10. All clients with stage
        supabase
          .from('clients')
          .select('id, stage_id')
          .eq('company_id', companyId),

        // 11. Departments
        supabase
          .from('departments')
          .select('id, name, color')
          .eq('company_id', companyId)
          .eq('is_active', true),

        // 12. Active conversations (real-time)
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .in('status', ['active', 'waiting']),

        // 13. Appointments today
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .gte('scheduled_for', todayStart)
          .lte('scheduled_for', todayEnd)
          .neq('status', 'cancelled'),
      ]);

      const newClients = clientsRes.count ?? 0;
      const conversations = convsRes.data ?? [];
      const appointments = aptsRes.data ?? [];
      const sales = salesRes.data ?? [];
      const prevClients = prevClientsRes.count ?? 0;
      const prevSales = prevSalesRes.data ?? [];
      const messages = (msgsRes.data ?? []) as any[];
      const users = usersRes.data ?? [];
      const stages = stagesRes.data ?? [];
      const allClients = allClientsRes.data ?? [];
      const departments = deptsRes.data ?? [];
      const activeConversations = activeConvsRes.count ?? 0;
      const todayAppointmentsCount = todayAptsRes.count ?? 0;

      // === KPIs ===
      const totalConversations = conversations.length;
      const aiConversations = conversations.filter(c => c.ai_handled).length;
      const aiPercentage = totalConversations > 0 ? (aiConversations / totalConversations) * 100 : 0;

      const revenue = sales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
      const prevRevenue = prevSales.reduce((sum, s: any) => sum + (Number(s.total_amount) || 0), 0);

      const agentsOnline = users.filter(u => u.is_online).length;
      const totalAgents = users.length;

      const avgResponseTime = computeAvgResponseTime(
        messages.map((m: any) => ({
          conversation_id: m.conversation_id,
          sender_type: m.sender_type,
          created_at: m.created_at,
        }))
      );

      const newClientsTrend = computeTrend(newClients, prevClients);
      const revenueTrend = computeTrend(revenue, prevRevenue);

      // === Chart: Hourly messages ===
      const hourlyMap = new Map<number, number>();
      for (let h = 0; h < 24; h++) hourlyMap.set(h, 0);
      for (const msg of messages) {
        const hour = new Date(msg.created_at).getHours();
        hourlyMap.set(hour, (hourlyMap.get(hour) ?? 0) + 1);
      }
      const hourlyData = Array.from(hourlyMap.entries()).map(([hour, count]) => ({
        hour: `${hour.toString().padStart(2, '0')}h`,
        mensagens: count,
      }));

      // === Chart: Agent performance ===
      const agentCountMap = new Map<string, number>();
      for (const conv of conversations) {
        const agentId = conv.assigned_to || conv.transferred_to;
        if (agentId) {
          agentCountMap.set(agentId, (agentCountMap.get(agentId) ?? 0) + 1);
        }
      }
      const userMap = new Map(users.map(u => [u.id, u.full_name || 'Sem nome']));
      const agentData = Array.from(agentCountMap.entries())
        .map(([id, count]) => ({ name: userMap.get(id) || 'Desconhecido', conversas: count, fill: '' }))
        .sort((a, b) => b.conversas - a.conversas)
        .slice(0, 10)
        .map((item, i) => ({ ...item, fill: AGENT_COLORS[i % AGENT_COLORS.length] }));

      // === Chart: Funnel ===
      const funnelData = stages.map((stage, index) => ({
        name: stage.name,
        clientes: allClients.filter(c => c.stage_id === stage.id).length,
        fill: FUNNEL_COLORS[index % FUNNEL_COLORS.length],
      }));

      // === Chart: Daily revenue ===
      const revenueByDay = new Map<string, { display: string; receita: number }>();
      for (const sale of sales) {
        const d = new Date(sale.created_at);
        const key = format(d, 'yyyy-MM-dd');
        const display = format(d, 'dd/MM');
        const existing = revenueByDay.get(key);
        revenueByDay.set(key, {
          display,
          receita: (existing?.receita ?? 0) + (Number(sale.total_amount) || 0),
        });
      }
      const dailyRevenue = Array.from(revenueByDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, { display, receita }]) => ({ date: display, receita }));

      // === Chart: Department breakdown ===
      const deptCountMap = new Map<string, number>();
      let noDeptCount = 0;
      for (const conv of conversations) {
        if (conv.department_id) {
          deptCountMap.set(conv.department_id, (deptCountMap.get(conv.department_id) ?? 0) + 1);
        } else {
          noDeptCount++;
        }
      }
      const deptMap = new Map<string, { name: string; color: string }>(
        departments.map((d: any) => [d.id, { name: d.name, color: d.color }])
      );
      const departmentData = [
        ...Array.from(deptCountMap.entries()).map(([id, count], i) => ({
          name: deptMap.get(id)?.name || 'Desconhecido',
          value: count,
          fill: deptMap.get(id)?.color || DEPT_COLORS[i % DEPT_COLORS.length],
        })),
        ...(noDeptCount > 0
          ? [{ name: 'Sem departamento', value: noDeptCount, fill: 'hsl(var(--muted-foreground))' }]
          : []),
      ];

      // === Chart: Daily conversion / no-show rates ===
      const ratesByDay = new Map<string, { display: string; total: number; completed: number; noShow: number }>();
      for (const apt of appointments) {
        const d = new Date(apt.scheduled_for);
        const key = format(d, 'yyyy-MM-dd');
        const display = format(d, 'dd/MM');
        if (!ratesByDay.has(key)) ratesByDay.set(key, { display, total: 0, completed: 0, noShow: 0 });
        const entry = ratesByDay.get(key)!;
        entry.total++;
        if (apt.status === 'completed') entry.completed++;
        if (apt.status === 'no_show') entry.noShow++;
      }
      const dailyRates = Array.from(ratesByDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, data]) => ({
          date: data.display,
          conversao: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
          noShow: data.total > 0 ? Math.round((data.noShow / data.total) * 100) : 0,
        }));

      return {
        newClients,
        newClientsTrend,
        activeConversations,
        todayAppointments: todayAppointmentsCount,
        avgResponseTime,
        revenue,
        revenueTrend,
        agentsOnline,
        totalAgents,
        totalConversations,
        aiPercentage,
        hourlyData,
        agentData,
        funnelData,
        dailyRevenue,
        departmentData,
        dailyRates,
      };
    },
    enabled: !!companyId,
    staleTime: 30000,
  });

  const defaults = {
    newClients: 0,
    newClientsTrend: null as number | null,
    activeConversations: 0,
    todayAppointments: 0,
    avgResponseTime: 0,
    revenue: 0,
    revenueTrend: null as number | null,
    agentsOnline: 0,
    totalAgents: 0,
    totalConversations: 0,
    aiPercentage: 0,
    hourlyData: [] as { hour: string; mensagens: number }[],
    agentData: [] as { name: string; conversas: number; fill: string }[],
    funnelData: [] as { name: string; clientes: number; fill: string }[],
    dailyRevenue: [] as { date: string; receita: number }[],
    departmentData: [] as { name: string; value: number; fill: string }[],
    dailyRates: [] as { date: string; conversao: number; noShow: number }[],
  };

  return { ...(data ?? defaults), isLoading };
}
