import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
  UtensilsCrossed,
  Clock,
  DollarSign,
  Users,
  Calendar as CalendarIcon,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  BarChart3,
  Kanban,
  CheckCircle2,
  Hourglass,
  Headset,
  Bot,
  User,
  Inbox,
  Send,
} from 'lucide-react';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { OnboardingChecklist } from '@/components/dashboard/OnboardingChecklist';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';

/**
 * Dashboard do restaurante.
 *
 * Mesmo layout do CRM wyarp (aba Tempo Real com KPIs em destaque, status,
 * fluxo e performance; aba Relatorios com historico), com o que e proprio do
 * restaurante preservado na aba Relatorios: tempo economizado pela IA,
 * reservas feitas pela IA e reservas por origem. Agendamento/no-show nao
 * entram: aqui o equivalente e reserva, que tem tela propria.
 */

// ── Constants ──────────────────────────────────────────────

type PresetKey = '1d' | '7d' | '15d' | '30d' | 'custom';
type TabKey = 'realtime' | 'reports';

const PRESETS: { key: PresetKey; label: string; days: number }[] = [
  { key: '1d', label: 'Hoje', days: 1 },
  { key: '7d', label: '7 dias', days: 7 },
  { key: '15d', label: '15 dias', days: 15 },
  { key: '30d', label: '30 dias', days: 30 },
];

// Abas internas alternam a visao; as externas levam pra pagina propria.
const TABS: { key: TabKey | 'kanban' | 'reservations'; label: string; icon: React.ElementType; href?: string }[] = [
  { key: 'realtime', label: 'Tempo Real', icon: Activity },
  { key: 'reports', label: 'Relatórios', icon: BarChart3 },
  { key: 'kanban', label: 'Kanban', icon: Kanban, href: '/app/crm' },
  { key: 'reservations', label: 'Reservas', icon: UtensilsCrossed, href: '/app/reservations' },
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

// Cores de status: as unicas cores "com significado" da aba Tempo Real.
const STATUS_COLORS = {
  active: 'hsl(217, 91%, 60%)',
  pending: 'hsl(38, 92%, 50%)',
  closed: 'hsl(160, 84%, 39%)',
};

// ── Helpers ────────────────────────────────────────────────

function formatCompactCurrency(value: number): string {
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(1)}k`;
  return formatCurrency(value);
}

function formatResponseTime(minutes: number): string {
  if (minutes === 0) return '-';
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  const m = Math.floor(minutes);
  const s = Math.round((minutes - m) * 60);
  if (minutes < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(minutes / 60);
  const rm = Math.round(minutes % 60);
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatSavedTime(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}min`;
}

function getPeriodLabel(preset: PresetKey, from: Date, to: Date): string {
  if (preset === '1d') return 'hoje';
  if (preset !== 'custom') {
    const p = PRESETS.find(p => p.key === preset);
    return `últimos ${p?.days} dias`;
  }
  return `${format(from, 'dd/MM/yyyy', { locale: ptBR })} - ${format(to, 'dd/MM/yyyy', { locale: ptBR })}`;
}

// ── Inline Components ──────────────────────────────────────

function TrendBadge({ value, invert, onDark }: { value: number; invert?: boolean; onDark?: boolean }) {
  const isPositive = invert ? value <= 0 : value >= 0;
  const Arrow = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
        onDark
          ? 'bg-white/15 text-white'
          : isPositive
            ? 'text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/50'
            : 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-950/50'
      )}
    >
      <Arrow className="h-3 w-3" />
      {Math.abs(value).toFixed(0)}%
    </span>
  );
}

/**
 * KPI. Um unico card por linha usa `highlight` (fundo primario): e o numero
 * que resume o negocio; os outros ficam neutros de proposito.
 */
function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  invertTrend,
  isLoading,
  highlight,
  href,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: number | null;
  invertTrend?: boolean;
  isLoading?: boolean;
  highlight?: boolean;
  href?: string;
}) {
  const router = useRouter();
  return (
    <div
      className={cn(
        'relative rounded-2xl p-5 transition-shadow duration-200',
        highlight
          ? 'bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(59,124,255,0.25)]'
          : 'bg-card border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.3)]'
      )}
    >
      {highlight && (
        // Decoracao recortada num wrapper proprio: o card NAO pode ter
        // overflow-hidden, senao valores longos (R$) sao cortados em silencio.
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="absolute -right-10 -bottom-16 h-44 w-44 rounded-full bg-white/10" />
          <div className="absolute -right-2 -bottom-24 h-44 w-44 rounded-full bg-white/5" />
        </div>
      )}

      <div className="relative flex items-start justify-between">
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full',
            highlight ? 'bg-white/15' : 'bg-primary/10'
          )}
        >
          <Icon className={cn('h-4 w-4', highlight ? 'text-white' : 'text-primary')} />
        </span>
        {href && (
          <button
            type="button"
            onClick={() => router.push(href)}
            aria-label={`Abrir ${title}`}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
              highlight
                ? 'bg-white/15 text-white hover:bg-white/25'
                : 'border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className={cn('relative mt-4 text-[13px] font-semibold', highlight ? 'text-white/90' : 'text-foreground')}>
        {title}
      </p>

      {isLoading ? (
        <Skeleton className={cn('mt-2 h-9 w-24', highlight && 'bg-white/20')} />
      ) : (
        <>
          <p
            title={String(value)}
            className={cn(
              'relative mt-1 min-w-0 truncate text-[36px] font-bold leading-none tracking-tight tabular-nums',
              // No dark mode --primary-foreground e quase preto; o resto do
              // card highlight ja e text-white, o valor precisa acompanhar.
              highlight && 'text-white'
            )}
          >
            {value}
          </p>
          {(trend != null || subtitle) && (
            <div className="relative mt-3 flex items-center gap-2">
              {trend != null && <TrendBadge value={trend} invert={invertTrend} onDark={highlight} />}
              {subtitle && (
                <span className={cn('text-[11px] font-medium', highlight ? 'text-white/70' : 'text-muted-foreground')}>
                  {subtitle}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Card de detalhe: titulo + conteudo. Cada um responde UMA pergunta. */
function DetailCard({
  title,
  children,
  footer,
  isLoading,
}: {
  title: string;
  children: React.ReactNode;
  footer?: { icon: React.ElementType; title: string; description: string };
  isLoading?: boolean;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      <div className="mt-4 flex-1">
        {isLoading ? <Skeleton className="h-[200px] w-full rounded-xl" /> : children}
      </div>
      {footer && !isLoading && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-primary/5 px-4 py-3 dark:bg-primary/10">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <footer.icon className="h-4 w-4 text-primary" />
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold leading-tight">{footer.title}</p>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{footer.description}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Donut com total no centro e legenda com contagens. */
function StatusDonut({ data }: { data: { name: string; value: number; fill: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const chartData = total > 0 ? data : [{ name: 'Sem dados', value: 1, fill: 'hsl(var(--muted))' }];
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[140px] w-[140px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={46}
              outerRadius={66}
              paddingAngle={total > 0 ? 3 : 0}
              dataKey="value"
              nameKey="name"
              stroke="none"
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            {total > 0 && (
              <RechartsTooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number, name: string) => [`${v} conversas`, name]}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[22px] font-bold leading-none tabular-nums">{formatNumber(total)}</span>
          <span className="text-[10px] font-medium text-muted-foreground mt-1">Total</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {data.map(item => (
          <li key={item.name} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} />
              <span className="truncate">{item.name}</span>
            </span>
            <span className="font-semibold tabular-nums">{formatNumber(item.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Duas barras horizontais comparando dois volumes. */
function FlowBars({ rows }: { rows: { label: string; icon: React.ElementType; value: number }[] }) {
  const max = Math.max(...rows.map(r => r.value), 1);
  return (
    <div className="space-y-5 py-2">
      {rows.map(row => (
        <div key={row.label} className="flex items-center gap-3">
          <span className="flex w-24 shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground">
            <row.icon className="h-3.5 w-3.5" />
            {row.label}
          </span>
          <div className="flex-1">
            <div className="h-3 w-full rounded-full bg-muted/60">
              <div
                className="h-3 rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${Math.max((row.value / max) * 100, row.value > 0 ? 3 : 0)}%` }}
              />
            </div>
          </div>
          <span className="w-14 shrink-0 text-right text-[13px] font-semibold tabular-nums">
            {formatNumber(row.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Barras verticais comparando dois tempos (em minutos). */
function TimeBars({ rows }: { rows: { label: string; icon: React.ElementType; minutes: number; muted?: boolean }[] }) {
  const max = Math.max(...rows.map(r => r.minutes), 1);
  return (
    <div className="flex h-[200px] items-end justify-around px-4">
      {rows.map(row => {
        const pct = row.minutes > 0 ? Math.max((row.minutes / max) * 100, 6) : 0;
        return (
          <div key={row.label} className="flex h-full w-20 flex-col items-center justify-end">
            <span className="mb-2 text-[12px] font-semibold tabular-nums">{formatResponseTime(row.minutes)}</span>
            <div className="flex h-[130px] w-full items-end">
              <div
                className={cn('w-full rounded-t-lg transition-[height] duration-500', row.muted ? 'bg-muted-foreground/40' : 'bg-primary')}
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
              <row.icon className="h-3 w-3" />
              {row.label}
            </span>
          </div>
        );
      })}
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
            <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', iconBg || 'bg-muted')}>
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

/** Pizza com legenda embaixo: IA vs Humano, Reservas por origem, Departamentos. */
function SplitPie({
  data,
  unit,
}: {
  data: { name: string; value: number; fill: string }[];
  unit: string;
}) {
  return (
    <>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={3} dataKey="value" nameKey="name">
            {data.map((entry, i) => (<Cell key={i} fill={entry.fill} />))}
          </Pie>
          <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [`${v} ${unit}`, name]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-1.5 text-xs">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.fill }} />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="font-semibold">{item.value}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Main Component ─────────────────────────────────────────

export default function CompanyDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('realtime');
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
    // "Hoje" = hoje 00:00 -> 23:59; "7 dias" = 7 dias corridos incluindo hoje.
    const from = new Date();
    from.setDate(from.getDate() - (p.days - 1));
    from.setHours(0, 0, 0, 0);
    return { dateFrom: from, dateTo: to };
  }, [preset, customFrom, customTo]);

  const periodLabel = getPeriodLabel(preset, dateFrom, dateTo);

  const {
    newClients, newClientsTrend,
    totalConversations,
    avgResponseTime,
    revenue, revenueTrend,
    agentsOnline, totalAgents,
    hourlyData, agentData, funnelData,
    dailyRevenue, departmentData,
    timeSavedMinutes, aiReservations,
    aiVsHumanData, reservationsSourceData,
    pendingNow, activeNow, closedInPeriod,
    conversationsTrend, closedTrend,
    receivedMessages, sentMessages, aiShare,
    aiResponseTime, humanResponseTime,
    statusInPeriod,
    isLoading,
  } = useDashboardMetrics(dateFrom, dateTo);

  const handlePreset = (key: PresetKey) => {
    setPreset(key);
    if (key !== 'custom') {
      setCustomFrom(undefined);
      setCustomTo(undefined);
    }
  };

  // Donut 100% na janela do periodo: o total do centro e o mesmo do KPI em
  // destaque (conversas criadas no periodo). Os KPIs "Aguardando" e "Em
  // Atendimento" sao snapshot de agora: janelas diferentes, rotuladas.
  const statusData = [
    { name: 'Em atendimento', value: statusInPeriod.active, fill: STATUS_COLORS.active },
    { name: 'Aguardando', value: statusInPeriod.pending, fill: STATUS_COLORS.pending },
    { name: 'Finalizadas', value: statusInPeriod.closed, fill: STATUS_COLORS.closed },
  ];

  // Conta nova / periodo sem movimento → todos os graficos vazios. Nesse caso
  // mostramos UM painel de boas-vindas no lugar da parede de caixas vazias.
  const allChartsEmpty =
    !isLoading &&
    aiVsHumanData.length === 0 &&
    reservationsSourceData.length === 0 &&
    agentData.length === 0 &&
    funnelData.length === 0 &&
    dailyRevenue.length === 0 &&
    departmentData.length === 0 &&
    hourlyData.every((d) => d.mensagens === 0);

  return (
    <div className="space-y-6">
      {/* Primeiros passos (some quando tudo configurado) */}
      <OnboardingChecklist />

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
          <p className="text-muted-foreground text-[14px] mt-1">
            O que a IA fez pelo seu restaurante: atendimento, reservas e receita.
          </p>
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
                  ? `${format(customFrom, 'dd/MM/yyyy')} - ${format(customTo, 'dd/MM/yyyy')}`
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

      {/* Tabs: Tempo Real / Relatórios (internas) · Kanban / Reservas (paginas) */}
      <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-card p-1 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        {TABS.map(t => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => (t.href ? router.push(t.href) : setTab(t.key as TabKey))}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'realtime' ? (
        <>
          {/* Row 1: 4 KPIs: um em destaque, tres neutros */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Total de Atendimentos"
              value={formatNumber(totalConversations)}
              subtitle={`vs período anterior · ${periodLabel}`}
              icon={MessageSquare}
              trend={conversationsTrend}
              highlight
              href="/app/conversations"
              isLoading={isLoading}
            />
            <KpiCard
              title="Aguardando"
              value={formatNumber(pendingNow)}
              subtitle="na fila agora"
              icon={Hourglass}
              href="/app/conversations"
              isLoading={isLoading}
            />
            <KpiCard
              title="Em Atendimento"
              value={formatNumber(activeNow)}
              subtitle="abertas agora"
              icon={Headset}
              href="/app/conversations"
              isLoading={isLoading}
            />
            <KpiCard
              title="Finalizados"
              value={formatNumber(closedInPeriod)}
              subtitle={`vs período anterior · ${periodLabel}`}
              icon={CheckCircle2}
              trend={closedTrend}
              href="/app/conversations"
              isLoading={isLoading}
            />
          </div>

          {/* Row 2: 3 cards de detalhe: estado, fluxo, performance */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DetailCard
              title="Status dos Atendimentos"
              isLoading={isLoading}
              footer={{
                icon: Activity,
                title: 'Conversas do período por status',
                description: `Distribuição das ${formatNumber(totalConversations)} conversas criadas ${periodLabel}.`,
              }}
            >
              <StatusDonut data={statusData} />
            </DetailCard>

            <DetailCard
              title="Fluxo de Mensagens"
              isLoading={isLoading}
              footer={{
                icon: MessageSquare,
                title: `${formatNumber(receivedMessages + sentMessages)} mensagens no período`,
                description: `Recebidas dos clientes vs enviadas: ${aiShare.toFixed(0)}% das enviadas foram pela IA.`,
              }}
            >
              <FlowBars
                rows={[
                  { label: 'Recebidas', icon: Inbox, value: receivedMessages },
                  { label: 'Enviadas', icon: Send, value: sentMessages },
                ]}
              />
            </DetailCard>

            <DetailCard
              title="Performance"
              isLoading={isLoading}
              footer={{
                icon: Clock,
                title: `Primeira resposta em ${formatResponseTime(avgResponseTime)}`,
                description: 'Tempo médio até a primeira resposta ao cliente, hoje.',
              }}
            >
              <TimeBars
                rows={[
                  { label: 'IA', icon: Bot, minutes: aiResponseTime },
                  { label: 'Atendente', icon: User, minutes: humanResponseTime, muted: true },
                ]}
              />
            </DetailCard>
          </div>
        </>
      ) : (
        <>
          {/* Relatórios: valor gerado pela IA (restaurante) + graficos historicos */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Tempo economizado"
              value={formatSavedTime(timeSavedMinutes)}
              subtitle={`${periodLabel} · IA atendendo`}
              icon={Clock}
              highlight
              isLoading={isLoading}
            />
            <KpiCard
              title="Reservas pela IA"
              value={formatNumber(aiReservations)}
              subtitle={periodLabel}
              icon={UtensilsCrossed}
              href="/app/reservations"
              isLoading={isLoading}
            />
            <KpiCard
              title="Receita gerada"
              value={formatCompactCurrency(revenue)}
              subtitle={periodLabel}
              icon={DollarSign}
              trend={revenueTrend}
              isLoading={isLoading}
            />
            <KpiCard
              title="Novos Clientes"
              value={formatNumber(newClients)}
              subtitle={periodLabel}
              icon={UserPlus}
              trend={newClientsTrend}
              href="/app/clients"
              isLoading={isLoading}
            />
          </div>

          {allChartsEmpty ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-gradient-to-b from-primary/[0.05] to-transparent px-6 py-16 flex flex-col items-center justify-center text-center gap-3">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <UtensilsCrossed className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight">Seus gráficos aparecem aqui</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Assim que seu restaurante começar a receber atendimentos e reservas pela IA,
                os gráficos de desempenho aparecem automaticamente nesta tela.
              </p>
            </div>
          ) : (
            <>
              {/* Pizzas: IA vs Humano + Reservas por origem */}
              <div className="grid gap-4 md:grid-cols-2">
                <ChartCard
                  title="Atendimentos: IA vs Humano"
                  icon={MessageSquare}
                  iconColor="text-primary"
                  iconBg="bg-primary/10"
                  isLoading={isLoading}
                  isEmpty={aiVsHumanData.length === 0}
                >
                  <SplitPie data={aiVsHumanData} unit="conversas" />
                </ChartCard>

                <ChartCard
                  title="Reservas por origem"
                  icon={UtensilsCrossed}
                  iconColor="text-primary"
                  iconBg="bg-primary/10"
                  emptyMessage="As reservas aparecerão aqui"
                  isLoading={isLoading}
                  isEmpty={reservationsSourceData.length === 0}
                >
                  <SplitPie data={reservationsSourceData} unit="reservas" />
                </ChartCard>
              </div>

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

              <div className="grid gap-4 md:grid-cols-2">
                <ChartCard
                  title="Atendimentos por Departamento"
                  icon={Users}
                  iconColor="text-cyan-500"
                  iconBg="bg-cyan-500/10"
                  isLoading={isLoading}
                  isEmpty={departmentData.length === 0}
                >
                  <SplitPie data={departmentData} unit="conversas" />
                </ChartCard>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
