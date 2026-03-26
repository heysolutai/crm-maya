import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Users,
  MessageSquare,
  Calendar as CalendarIcon,
  TrendingUp,
  XCircle,
  DollarSign,
  Bot,
  MessagesSquare,
  Info,
  CalendarDays,
  CalendarCheck,
  UserCheck,
  UserPlus,
  ShoppingBag,
} from 'lucide-react';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { useDailyReport } from '@/hooks/useDailyReport';
import { formatCurrency } from '@/lib/utils';
import { ChartContainer } from '@/components/ui/chart';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  BarChart, 
  Bar, 
  AreaChart,
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  LabelList
} from 'recharts';

type PresetKey = '1d' | '7d' | '15d' | '30d' | 'custom';

const PRESETS: { key: PresetKey; label: string; days: number }[] = [
  { key: '1d', label: 'Hoje', days: 1 },
  { key: '7d', label: '7 dias', days: 7 },
  { key: '15d', label: '15 dias', days: 15 },
  { key: '30d', label: '30 dias', days: 30 },
];

function MetricTooltip({ content }: { content: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        <p className="text-xs">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function formatCompactCurrency(value: number): string {
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(1)}k`;
  return formatCurrency(value);
}

function getPeriodLabel(preset: PresetKey, from: Date, to: Date): string {
  if (preset === '1d') return 'hoje';
  if (preset !== 'custom') {
    const p = PRESETS.find(p => p.key === preset);
    return `últimos ${p?.days} dias`;
  }
  return `${format(from, 'dd/MM', { locale: ptBR })} - ${format(to, 'dd/MM', { locale: ptBR })}`;
}

export default function CompanyDashboard() {
  const [preset, setPreset] = useState<PresetKey>('1d');
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
    newClients,
    totalConversations,
    aiConversations,
    aiPercentage,
    totalAppointments,
    conversionRate,
    noShowRate,
    revenue,
    funnelData,
    monthlyRevenue,
    isLoading,
  } = useDashboardMetrics(dateFrom, dateTo);

  const {
    crmEntries,
    crmScheduled,
    crmScheduledToday,
    todayAppointments,
    todaySales,
    salesTotalAmount,
  } = useDailyReport();

  const attendedCount = todayAppointments.filter((a: any) => a.status === 'completed' && a.notes !== 'walk-in').length;
  const walkInCount = todayAppointments.filter((a: any) => a.status === 'completed' && a.notes === 'walk-in').length;

  const handlePreset = (key: PresetKey) => {
    setPreset(key);
    if (key !== 'custom') {
      setCustomFrom(undefined);
      setCustomTo(undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Visão geral das métricas da sua empresa
          </p>
        </div>

        {/* Date Filters */}
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

      {/* Daily Report */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: Users, value: crmEntries, label: 'Entrantes', color: 'text-blue-500' },
          { icon: CalendarDays, value: crmScheduled, label: 'Agendaram Hoje', color: 'text-violet-500' },
          { icon: CalendarCheck, value: crmScheduledToday, label: 'Agendados p/ Hoje', color: 'text-indigo-500' },
          { icon: UserCheck, value: attendedCount, label: 'Compareceram', color: 'text-green-500' },
          { icon: UserPlus, value: walkInCount, label: 'Sem Agendar', color: 'text-amber-500' },
          { icon: DollarSign, value: formatCurrency(salesTotalAmount), label: 'Total Vendas', color: 'text-primary' },
        ].map(({ icon: Icon, value, label, color }) => (
          <Card key={label} className="bg-gradient-to-br from-background to-muted/30">
            <CardContent className="pt-4 pb-3 px-4 flex flex-col items-center text-center">
              <Icon className={`h-5 w-5 ${color} mb-1`} />
              <span className="text-2xl font-bold">{value}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-background to-muted/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Novos Contatos
              <MetricTooltip content="Total de clientes cadastrados no período selecionado" />
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">{newClients}</div>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background to-muted/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Total Conversas
              <MetricTooltip content="Todas as conversas iniciadas no período selecionado" />
            </CardTitle>
            <MessagesSquare className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">{totalConversations}</div>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background to-muted/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Conversas IA
              <MetricTooltip content="Conversas onde a IA respondeu automaticamente" />
            </CardTitle>
            <Bot className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">{aiConversations}</div>
                <p className="text-xs text-muted-foreground">{aiPercentage.toFixed(0)}% de automação</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background to-muted/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Agendamentos
              <MetricTooltip content="Total de agendamentos no período selecionado" />
            </CardTitle>
            <CalendarIcon className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">{totalAppointments}</div>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background to-muted/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Taxa de Conversão
              <MetricTooltip content="Porcentagem de clientes no estágio final do funil" />
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">{conversionRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">clientes convertidos</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background to-muted/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Taxa de No-Show
              <MetricTooltip content="Porcentagem de agendamentos onde o cliente não compareceu" />
            </CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">{noShowRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">ausências</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Receita
              <MetricTooltip content="Total de vendas no período selecionado" />
            </CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-32" /> : (
              <>
                <div className="text-3xl font-bold text-primary">{formatCurrency(revenue)}</div>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Funil de Conversão
              <MetricTooltip content="Distribuição de clientes por estágio do funil de vendas" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : funnelData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart 
                  data={funnelData} 
                  layout="vertical"
                  margin={{ top: 5, right: 40, left: 0, bottom: 5 }}
                >
                  <defs>
                    {funnelData.map((entry, index) => (
                      <linearGradient key={`gradient-${index}`} id={`colorGradient-${index}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={entry.fill} stopOpacity={0.8} />
                        <stop offset="100%" stopColor={entry.fill} stopOpacity={1} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                    formatter={(value: number) => [`${value} clientes`, '']}
                  />
                  <Bar dataKey="clientes" radius={[0, 6, 6, 0]} maxBarSize={35} animationDuration={1200} animationEasing="ease-out">
                    {funnelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={`url(#colorGradient-${index})`} />
                    ))}
                    <LabelList dataKey="clientes" position="right" fill="hsl(var(--foreground))" fontSize={12} fontWeight={600} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Evolução de Receita
              <MetricTooltip content="Receita mensal acumulada ao longo do tempo" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : monthlyRevenue.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={monthlyRevenue} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                  <YAxis tickFormatter={formatCompactCurrency} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} width={70} axisLine={{ stroke: 'hsl(var(--border))' }} />
                  <RechartsTooltip 
                    formatter={(value: number) => [formatCurrency(value), 'Receita']}
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={3} fill="url(#revenueGradient)"
                    dot={{ fill: 'hsl(var(--primary))', r: 4, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
                    activeDot={{ r: 6, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                    animationDuration={1200} animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
