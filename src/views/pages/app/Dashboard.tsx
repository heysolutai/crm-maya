import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn, formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  UserPlus,
  MessageSquare,
  CalendarCheck,
  Clock,
  DollarSign,
  Users,
  Calendar as CalendarIcon,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  Legend,
} from 'recharts';

// ── Constants ──────────────────────────────────────────────

type PresetKey = '1d' | '7d' | '15d' | '30d' | 'custom';

const PRESETS: { key: PresetKey; label: string; days: number }[] = [
  { key: '1d', label: 'Hoje', days: 1 },
  { key: '7d', label: '7 dias', days: 7 },
  { key: '15d', label: '15 dias', days: 15 },
  { key: '30d', label: '30 dias', days: 30 },
];

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--background))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
};

const LABEL_STYLE = { color: 'hsl(var(--foreground))', fontWeight: 600 };
const AXIS_TICK = { fill: 'hsl(var(--muted-foreground))', fontSize: 11 };
const AXIS_LINE = { stroke: 'hsl(var(--border))' };

// ── Helpers ────────────────────────────────────────────────

function formatCompactCurrency(value: number): string {
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(1)}k`;
  return formatCurrency(value);
}

function formatResponseTime(minutes: number): string {
  if (minutes === 0) return '—';
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  const m = Math.floor(minutes);
  const s = Math.round((minutes - m) * 60);
  if (minutes < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(minutes / 60);
  const rm = Math.round(minutes % 60);
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function getPeriodLabel(preset: PresetKey, from: Date, to: Date): string {
  if (preset === '1d') return 'hoje';
  if (preset !== 'custom') {
    const p = PRESETS.find(p => p.key === preset);
    return `últimos ${p?.days} dias`;
  }
  return `${format(from, 'dd/MM', { locale: ptBR })} - ${format(to, 'dd/MM', { locale: ptBR })}`;
}

// ── Inline Components ──────────────────────────────────────

function TrendBadge({ value, invert }: { value: number; invert?: boolean }) {
  const isPositive = invert ? value <= 0 : value >= 0;
  const Arrow = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
        isPositive
          ? 'text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/50'
          : 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-950/50'
      )}
    >
      <Arrow className="h-3 w-3" />
      {Math.abs(value).toFixed(0)}%
    </span>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  trend,
  invertTrend,
  isLoading,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  iconColor: string;
  trend?: number | null;
  invertTrend?: boolean;
  isLoading?: boolean;
}) {
  return (
    <Card className="bg-gradient-to-br from-background to-muted/30">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          <Icon className={cn('h-4 w-4', iconColor)} />
        </div>
        {isLoading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{value}</span>
              {trend != null && <TrendBadge value={trend} invert={invertTrend} />}
            </div>
            {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  children,
  isLoading,
  isEmpty,
}: {
  title: string;
  children: React.ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {isLoading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : isEmpty ? (
          <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
            Nenhum dado disponível
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Component ─────────────────────────────────────────

export default function CompanyDashboard() {
  const [preset, setPreset] = useState<PresetKey>('7d');
  const [customFrom, setCustomFrom] = useState<Date>();
  const [customTo, setCustomTo] = useState<Date>();

  const { dateFrom, dateTo } = useMemo(() => {
    if (preset === 'custom' && customFrom && customTo) {
      const from = new Date(customFrom);
      from.setHours(0, 0, 0, 0);
      const to = new Date(customTo);
      to.setHours(23, 59, 59, 999);
      return { dateFrom: from, dateTo: to };
    }
    const p = PRESETS.find(p => p.key === preset) || PRESETS[0];
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const from = new Date();
    from.setDate(from.getDate() - p.days);
    from.setHours(0, 0, 0, 0);
    return { dateFrom: from, dateTo: to };
  }, [preset, customFrom, customTo]);

  const periodLabel = getPeriodLabel(preset, dateFrom, dateTo);

  const {
    newClients, newClientsTrend,
    activeConversations, totalConversations, aiPercentage,
    todayAppointments,
    avgResponseTime,
    revenue, revenueTrend,
    agentsOnline, totalAgents,
    hourlyData, agentData, funnelData,
    dailyRevenue, departmentData, dailyRates,
    isLoading,
  } = useDashboardMetrics(dateFrom, dateTo);

  const handlePreset = (key: PresetKey) => {
    setPreset(key);
    if (key !== 'custom') {
      setCustomFrom(undefined);
      setCustomTo(undefined);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + Date Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral das métricas da sua empresa</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(p => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? 'default' : 'outline'}
              onClick={() => handlePreset(p.key)}
              className="text-xs"
            >
              {p.label}
            </Button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant={preset === 'custom' ? 'default' : 'outline'}
                className="text-xs gap-1.5"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {preset === 'custom' && customFrom && customTo
                  ? `${format(customFrom, 'dd/MM')} - ${format(customTo, 'dd/MM')}`
                  : 'Personalizado'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="end">
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Selecione o período</p>
                <div className="flex gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">De</p>
                    <Calendar
                      mode="single"
                      selected={customFrom}
                      onSelect={(d) => {
                        setCustomFrom(d);
                        if (d && customTo) setPreset('custom');
                      }}
                      disabled={(date) => date > new Date()}
                      className="p-2 pointer-events-auto"
                      locale={ptBR}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Até</p>
                    <Calendar
                      mode="single"
                      selected={customTo}
                      onSelect={(d) => {
                        setCustomTo(d);
                        if (customFrom && d) setPreset('custom');
                      }}
                      disabled={(date) => date > new Date() || (customFrom ? date < customFrom : false)}
                      className="p-2 pointer-events-auto"
                      locale={ptBR}
                    />
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          title="Novos Leads"
          value={newClients}
          subtitle={periodLabel}
          icon={UserPlus}
          iconColor="text-mileto-green"
          trend={newClientsTrend}
          isLoading={isLoading}
        />
        <KpiCard
          title="Em Atendimento"
          value={activeConversations}
          subtitle={`${totalConversations} no período · ${aiPercentage.toFixed(0)}% IA`}
          icon={MessageSquare}
          iconColor="text-mileto-cyan"
          isLoading={isLoading}
        />
        <KpiCard
          title="Agendamentos Hoje"
          value={todayAppointments}
          subtitle="para hoje"
          icon={CalendarCheck}
          iconColor="text-mileto-blue"
          isLoading={isLoading}
        />
        <KpiCard
          title="Tempo de Resposta"
          value={formatResponseTime(avgResponseTime)}
          subtitle="tempo médio hoje"
          icon={Clock}
          iconColor="text-mileto-cyan"
          invertTrend
          isLoading={isLoading}
        />
        <KpiCard
          title="Receita"
          value={formatCurrency(revenue)}
          subtitle={periodLabel}
          icon={DollarSign}
          iconColor="text-mileto-green"
          trend={revenueTrend}
          isLoading={isLoading}
        />
        <KpiCard
          title="Agentes Online"
          value={`${agentsOnline}/${totalAgents}`}
          subtitle="conectados"
          icon={Users}
          iconColor="text-primary"
          isLoading={isLoading}
        />
      </div>

      {/* Row 2: Hourly + Agent Performance */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard
          title="Atendimentos por Hora (Hoje)"
          isLoading={isLoading}
          isEmpty={hourlyData.every(d => d.mensagens === 0)}
        >
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="hourlyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={AXIS_LINE.stroke} />
              <XAxis dataKey="hour" tick={AXIS_TICK} axisLine={AXIS_LINE} interval={2} />
              <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} allowDecimals={false} />
              <RechartsTooltip contentStyle={TOOLTIP_STYLE} labelStyle={LABEL_STYLE} />
              <Area
                type="monotone"
                dataKey="mensagens"
                name="Mensagens"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#hourlyGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Performance por Agente"
          isLoading={isLoading}
          isEmpty={agentData.length === 0}
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={agentData} layout="vertical" margin={{ top: 5, right: 40, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke={AXIS_LINE.stroke} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={AXIS_LINE} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={90} tick={AXIS_TICK} axisLine={AXIS_LINE} />
              <RechartsTooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={LABEL_STYLE}
                formatter={(v: number) => [`${v} conversas`, '']}
              />
              <Bar dataKey="conversas" radius={[0, 6, 6, 0]} maxBarSize={28}>
                {agentData.map((entry: typeof agentData[0], i: number) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
                <LabelList dataKey="conversas" position="right" fill="hsl(var(--foreground))" fontSize={11} fontWeight={600} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 3: Funnel + Revenue */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard
          title="Funil de Conversão"
          isLoading={isLoading}
          isEmpty={funnelData.length === 0}
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={funnelData} layout="vertical" margin={{ top: 5, right: 40, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke={AXIS_LINE.stroke} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={AXIS_LINE} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={100} tick={AXIS_TICK} axisLine={AXIS_LINE} />
              <RechartsTooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={LABEL_STYLE}
                formatter={(v: number) => [`${v} clientes`, '']}
              />
              <Bar dataKey="clientes" radius={[0, 6, 6, 0]} maxBarSize={30}>
                {funnelData.map((entry: typeof funnelData[0], i: number) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
                <LabelList dataKey="clientes" position="right" fill="hsl(var(--foreground))" fontSize={11} fontWeight={600} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Evolução de Receita"
          isLoading={isLoading}
          isEmpty={dailyRevenue.length === 0}
        >
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dailyRevenue} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={AXIS_LINE.stroke} />
              <XAxis dataKey="date" tick={AXIS_TICK} axisLine={AXIS_LINE} />
              <YAxis tickFormatter={formatCompactCurrency} tick={AXIS_TICK} width={65} axisLine={AXIS_LINE} />
              <RechartsTooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={LABEL_STYLE}
                formatter={(v: number) => [formatCurrency(v), 'Receita']}
              />
              <Area
                type="monotone"
                dataKey="receita"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#revenueGrad)"
                dot={{ r: 3, fill: 'hsl(var(--primary))' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 4: Department Donut + Conversion vs No-Show */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard
          title="Atendimentos por Departamento"
          isLoading={isLoading}
          isEmpty={departmentData.length === 0}
        >
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={departmentData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={95}
                paddingAngle={3}
                dataKey="value"
                nameKey="name"
              >
                {departmentData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number, name: string) => [`${v} conversas`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1">
            {departmentData.map((item: typeof departmentData[0]) => (
              <div key={item.name} className="flex items-center gap-1.5 text-xs">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.fill }} />
                <span className="text-muted-foreground">{item.name}</span>
                <span className="font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard
          title="Conversão vs No-Show"
          isLoading={isLoading}
          isEmpty={dailyRates.length === 0}
        >
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dailyRates} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={AXIS_LINE.stroke} />
              <XAxis dataKey="date" tick={AXIS_TICK} axisLine={AXIS_LINE} />
              <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} unit="%" />
              <RechartsTooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={LABEL_STYLE}
                formatter={(v: number, name: string) => [`${v}%`, name]}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Line
                type="monotone"
                dataKey="conversao"
                name="Conversão"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3, fill: 'hsl(var(--primary))' }}
              />
              <Line
                type="monotone"
                dataKey="noShow"
                name="No-Show"
                stroke="hsl(var(--destructive))"
                strokeWidth={2}
                dot={{ r: 3, fill: 'hsl(var(--destructive))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
