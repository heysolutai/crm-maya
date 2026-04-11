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
  iconBg,
  trend,
  invertTrend,
  isLoading,
  highlight,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg?: string;
  trend?: number | null;
  invertTrend?: boolean;
  isLoading?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border p-5 transition-all duration-200',
        'hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_12px_32px_rgba(0,0,0,0.4)]',
        highlight
          ? 'border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card shadow-[0_4px_16px_rgba(59,124,255,0.08)] dark:shadow-[0_4px_16px_rgba(59,124,255,0.15)]'
          : 'border-border/80 bg-card shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)]'
      )}
    >
      {/* Icone grande no canto superior direito — decorativo */}
      <div
        className={cn(
          'absolute -top-2 -right-2 flex h-16 w-16 items-center justify-center rounded-2xl opacity-[0.08] transition-transform group-hover:scale-110 group-hover:opacity-[0.12]',
          iconBg?.replace('/10', '/40').replace('/15', '/50') || 'bg-muted'
        )}
      >
        <Icon className={cn('h-10 w-10', iconColor)} />
      </div>

      <div className="relative">
        <div className="flex items-center gap-2.5 mb-4">
          <span
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset',
              iconBg || 'bg-muted',
              iconColor.replace('text-', 'ring-') + '/20'
            )}
          >
            <Icon className={cn('h-[18px] w-[18px]', iconColor)} />
          </span>
          <span className="text-[12.5px] font-medium text-muted-foreground leading-tight">
            {title}
          </span>
        </div>

        {isLoading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-[32px] font-bold tracking-tight leading-none text-foreground">
                {value}
              </span>
              {trend != null && <TrendBadge value={trend} invert={invertTrend} />}
            </div>
            {subtitle && (
              <p className="text-[11.5px] text-muted-foreground mt-2 leading-tight font-medium">
                {subtitle}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  icon: Icon,
  iconColor,
  iconBg,
  children,
  isLoading,
  isEmpty,
  emptyMessage = 'Nenhum dado disponível',
}: {
  title: string;
  icon?: React.ElementType;
  iconColor?: string;
  iconBg?: string;
  children: React.ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.02)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-semibold tracking-tight flex items-center gap-2.5">
          {Icon && (
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg',
                iconBg || 'bg-muted'
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', iconColor)} />
            </span>
          )}
          {title}
        </h3>
      </div>
      {isLoading ? (
        <Skeleton className="h-[280px] w-full" />
      ) : isEmpty ? (
        <div className="h-[280px] flex flex-col items-center justify-center text-sm text-muted-foreground gap-2 bg-muted/20 rounded-xl border border-dashed border-border/60">
          <div className="h-12 w-12 rounded-full bg-muted/40 flex items-center justify-center">
            {Icon && <Icon className="h-5 w-5 text-muted-foreground/50" />}
          </div>
          <span className="font-medium">{emptyMessage}</span>
        </div>
      ) : (
        children
      )}
    </div>
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
          <div className="flex items-center gap-3">
            <h1 className="text-[28px] font-bold tracking-tight">Dashboard</h1>
            {!isLoading && totalAgents > 0 && (
              <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1 text-[12px] font-medium shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.2)]" />
                Agentes online · <strong>{agentsOnline}/{totalAgents}</strong>
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-[14px] mt-1">Visão geral das métricas da sua empresa</p>
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard
          title="Novos Leads"
          value={newClients}
          subtitle={periodLabel}
          icon={UserPlus}
          iconColor="text-blue-500"
          iconBg="bg-blue-500/10"
          trend={newClientsTrend}
          isLoading={isLoading}
        />
        <KpiCard
          title="Em Atendimento"
          value={activeConversations}
          subtitle={`${totalConversations} no período · ${aiPercentage.toFixed(0)}% IA`}
          icon={MessageSquare}
          iconColor="text-orange-500"
          iconBg="bg-orange-500/10"
          isLoading={isLoading}
        />
        <KpiCard
          title="Agendamentos Hoje"
          value={todayAppointments}
          subtitle="para hoje"
          icon={CalendarCheck}
          iconColor="text-purple-500"
          iconBg="bg-purple-500/10"
          isLoading={isLoading}
        />
        <KpiCard
          title="Tempo de Resposta"
          value={formatResponseTime(avgResponseTime)}
          subtitle="tempo médio hoje"
          icon={Clock}
          iconColor="text-cyan-500"
          iconBg="bg-cyan-500/10"
          invertTrend
          isLoading={isLoading}
        />
        <KpiCard
          title="Receita"
          value={formatCurrency(revenue)}
          subtitle={periodLabel}
          icon={DollarSign}
          iconColor="text-emerald-500"
          iconBg="bg-emerald-500/10"
          trend={revenueTrend}
          isLoading={isLoading}
        />
        <KpiCard
          title="Agentes Online"
          value={`${agentsOnline}/${totalAgents}`}
          subtitle={agentsOnline === totalAgents && totalAgents > 0 ? '✓ todos conectados' : 'conectados'}
          icon={Users}
          iconColor="text-blue-600"
          iconBg="bg-blue-500/15"
          highlight
          isLoading={isLoading}
        />
      </div>

      {/* Row 2: Hourly + Agent Performance */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard
          title="Atendimentos por Hora (Hoje)"
          icon={MessageSquare}
          iconColor="text-blue-500"
          iconBg="bg-blue-500/10"
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
          icon={Users}
          iconColor="text-orange-500"
          iconBg="bg-orange-500/10"
          emptyMessage="Os atendimentos aparecerão aqui"
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
          icon={UserPlus}
          iconColor="text-purple-500"
          iconBg="bg-purple-500/10"
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
          icon={DollarSign}
          iconColor="text-emerald-500"
          iconBg="bg-emerald-500/10"
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
          icon={Users}
          iconColor="text-cyan-500"
          iconBg="bg-cyan-500/10"
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
          icon={CalendarCheck}
          iconColor="text-pink-500"
          iconBg="bg-pink-500/10"
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
