import { useQuery } from '@tanstack/react-query';
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
  messages: { conversationId: string; senderType: string; createdAt: string }[]
): number {
  const byConversation = new Map<string, typeof messages>();
  for (const msg of messages) {
    const arr = byConversation.get(msg.conversationId) ?? [];
    arr.push(msg);
    byConversation.set(msg.conversationId, arr);
  }

  const responseTimes: number[] = [];
  for (const [, msgs] of byConversation) {
    const firstClient = msgs.find(m => m.senderType === 'client');
    if (!firstClient) continue;
    const firstResponse = msgs.find(
      m =>
        (m.senderType === 'agent' || m.senderType === 'ai') &&
        new Date(m.createdAt).getTime() > new Date(firstClient.createdAt).getTime()
    );
    if (!firstResponse) continue;
    const diffMin =
      (new Date(firstResponse.createdAt).getTime() - new Date(firstClient.createdAt).getTime()) / 60000;
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

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-metrics-v2', companyId, from, to],
    queryFn: async () => {
      if (!companyId) return null;

      const params = new URLSearchParams({
        companyId,
        from,
        to,
        prevFrom,
        prevTo,
      });

      const res = await fetch(`/api/dashboard-metrics?${params}`);
      if (!res.ok) throw new Error('Failed to fetch dashboard metrics');
      const raw = await res.json();

      const newClients = raw.newClientsCount ?? 0;
      const conversations = raw.conversations ?? [];
      const appointments = raw.appointments ?? [];
      const sales = raw.sales ?? [];
      const prevClients = raw.prevClientsCount ?? 0;
      const prevSales = raw.prevSales ?? [];
      const messages = raw.todayMessages ?? [];
      const users = raw.users ?? [];
      const stages = raw.stages ?? [];
      const allClients = raw.allClients ?? [];
      const departments = raw.departments ?? [];
      const activeConversations = raw.activeConversationsCount ?? 0;
      const todayAppointmentsCount = raw.todayAppointmentsCount ?? 0;
      const aiMessagesCount = raw.aiMessagesCount ?? 0;
      const aiReservations = raw.aiReservationsCount ?? 0;
      const reservationsTotal = raw.reservationsTotalCount ?? 0;

      // === KPIs ===
      const totalConversations = conversations.length;
      const aiConversations = conversations.filter((c: any) => c.aiHandled).length;
      const aiPercentage = totalConversations > 0 ? (aiConversations / totalConversations) * 100 : 0;

      const revenue = sales.reduce((sum: number, s: any) => sum + (Number(s.totalAmount) || 0), 0);
      const prevRevenue = prevSales.reduce((sum: number, s: any) => sum + (Number(s.totalAmount) || 0), 0);

      // Tempo economizado: estimativa = mensagens respondidas pela IA x minutos
      // que um atendente humano levaria por mensagem (leitura + digitacao + contexto).
      const MINUTES_PER_AI_MESSAGE = 2;
      const timeSavedMinutes = aiMessagesCount * MINUTES_PER_AI_MESSAGE;

      const agentsOnline = users.filter((u: any) => u.isOnline).length;
      const totalAgents = users.length;

      const avgResponseTime = computeAvgResponseTime(
        messages.map((m: any) => ({
          conversationId: m.conversationId,
          senderType: m.senderType,
          createdAt: m.createdAt,
        }))
      );

      const newClientsTrend = computeTrend(newClients, prevClients);
      const revenueTrend = computeTrend(revenue, prevRevenue);

      // === Chart: Hourly messages ===
      const hourlyMap = new Map<number, number>();
      for (let h = 0; h < 24; h++) hourlyMap.set(h, 0);
      for (const msg of messages) {
        const hour = new Date(msg.createdAt).getHours();
        hourlyMap.set(hour, (hourlyMap.get(hour) ?? 0) + 1);
      }
      const hourlyData = Array.from(hourlyMap.entries()).map(([hour, count]) => ({
        hour: `${hour.toString().padStart(2, '0')}h`,
        mensagens: count,
      }));

      // === Chart: Agent performance ===
      const agentCountMap = new Map<string, number>();
      for (const conv of conversations) {
        const agentId = conv.assignedTo || conv.transferredTo;
        if (agentId) {
          agentCountMap.set(agentId, (agentCountMap.get(agentId) ?? 0) + 1);
        }
      }
      const userMap = new Map(users.map((u: any) => [u.id, u.fullName || 'Sem nome']));
      const agentData = Array.from(agentCountMap.entries())
        .map(([id, count]) => ({ name: userMap.get(id) || 'Desconhecido', conversas: count, fill: '' }))
        .sort((a, b) => b.conversas - a.conversas)
        .slice(0, 10)
        .map((item, i) => ({ ...item, fill: AGENT_COLORS[i % AGENT_COLORS.length] }));

      // === Chart: Funnel ===
      const funnelData = stages.map((stage: any, index: number) => ({
        name: stage.name,
        clientes: allClients.filter((c: any) => c.stageId === stage.id).length,
        fill: FUNNEL_COLORS[index % FUNNEL_COLORS.length],
      }));

      // === Chart: Daily revenue ===
      const revenueByDay = new Map<string, { display: string; receita: number }>();
      for (const sale of sales) {
        const d = new Date(sale.createdAt);
        const key = format(d, 'yyyy-MM-dd');
        const display = format(d, 'dd/MM');
        const existing = revenueByDay.get(key);
        revenueByDay.set(key, {
          display,
          receita: (existing?.receita ?? 0) + (Number(sale.totalAmount) || 0),
        });
      }
      const dailyRevenue = Array.from(revenueByDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, { display, receita }]) => ({ date: display, receita }));

      // === Chart: Department breakdown ===
      const deptCountMap = new Map<string, number>();
      let noDeptCount = 0;
      for (const conv of conversations) {
        if (conv.departmentId) {
          deptCountMap.set(conv.departmentId, (deptCountMap.get(conv.departmentId) ?? 0) + 1);
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
        const d = new Date(apt.scheduledFor);
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

      // === Pizzas (restaurante) ===
      const humanConversations = Math.max(0, totalConversations - aiConversations);
      const aiVsHumanData = totalConversations > 0
        ? [
            { name: 'IA', value: aiConversations, fill: 'hsl(var(--primary))' },
            { name: 'Humano', value: humanConversations, fill: 'hsl(var(--muted-foreground))' },
          ]
        : [];
      const reservationsSourceData = reservationsTotal > 0
        ? [
            { name: 'IA', value: aiReservations, fill: 'hsl(var(--primary))' },
            { name: 'Outras', value: Math.max(0, reservationsTotal - aiReservations), fill: 'hsl(var(--muted-foreground))' },
          ]
        : [];

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
        // Restaurante — cards de valor da IA
        timeSavedMinutes,
        aiReservations,
        aiVsHumanData,
        reservationsSourceData,
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
    timeSavedMinutes: 0,
    aiReservations: 0,
    aiVsHumanData: [] as { name: string; value: number; fill: string }[],
    reservationsSourceData: [] as { name: string; value: number; fill: string }[],
  };

  return { ...(data ?? defaults), isLoading };
}
