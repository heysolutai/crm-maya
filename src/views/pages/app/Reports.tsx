'use client';

import { useState, useMemo } from 'react';
import {
  useReportOverview,
  resolvePeriod,
  PERIOD_LABELS,
  type PeriodPreset,
} from '@/hooks/useReportOverview';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  Users,
  MessageSquare,
  CalendarCheck,
  UserCheck,
  Megaphone,
  Sprout,
  Bot,
  Utensils,
  PartyPopper,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

const PRESETS: PeriodPreset[] = [
  'today',
  'last7',
  'last30',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'custom',
];

/** yyyy-MM-dd pro input date, no fuso local (evita cair um dia pra tras). */
function toInputDate(d: Date): string {
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
}

interface MetricProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  hint?: string;
}

function Metric({ icon: Icon, label, value, hint }: MetricProps) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const [preset, setPreset] = useState<PeriodPreset>('thisMonth');
  const [customFrom, setCustomFrom] = useState(() => toInputDate(new Date()));
  const [customTo, setCustomTo] = useState(() => toInputDate(new Date()));

  const { from, to } = useMemo(() => {
    if (preset === 'custom') {
      const f = new Date(`${customFrom}T00:00:00`);
      const t = new Date(`${customTo}T23:59:59`);
      return { from: f, to: t };
    }
    return resolvePeriod(preset);
  }, [preset, customFrom, customTo]);

  const { data, isLoading, error } = useReportOverview(from, to);

  const chartData = useMemo(
    () =>
      (data?.conversations.byDay || []).map((d) => ({
        // dd/MM pro eixo ficar legivel
        label: d.date.slice(8, 10) + '/' + d.date.slice(5, 7),
        total: d.total,
      })),
    [data]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-7 w-7" />
          Relatórios
        </h1>
        <p className="text-muted-foreground mt-1">
          Indicadores de leads, conversas e reservas por período
        </p>
      </div>

      {/* Filtro de período */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p}
              type="button"
              variant={preset === p ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPreset(p)}
            >
              {PERIOD_LABELS[p]}
            </Button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-3">
            <div className="space-y-1">
              <Label htmlFor="from">De</Label>
              <Input
                id="from"
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-auto"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">Até</Label>
              <Input
                id="to"
                type="date"
                value={customTo}
                min={customFrom}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-auto"
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-5">
            <p className="text-sm text-destructive">
              Não foi possível carregar o relatório. Tente novamente.
            </p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric icon={Users} label="Leads novos" value={data.leads.total} />
            <Metric
              icon={Sprout}
              label="Vieram do orgânico"
              value={data.leads.organic}
              hint="sem UTM / sem anúncio"
            />
            <Metric
              icon={Megaphone}
              label="Vieram do tráfego"
              value={data.leads.paid}
              hint="com UTM ou anúncio"
            />
            <Metric
              icon={MessageSquare}
              label="Conversas no período"
              value={data.conversations.total}
              hint={`média de ${data.conversations.perDayAvg}/dia`}
            />
            <Metric
              icon={CalendarCheck}
              label="Reservas no período"
              value={data.reservations.total}
            />
            <Metric
              icon={Bot}
              label="Reservas pela IA"
              value={data.reservations.byAi}
              hint={`${data.reservations.byHuman} pelo atendente`}
            />
            <Metric
              icon={UserCheck}
              label="Pediram atendimento humano"
              value={data.conversations.humanHandoff}
              hint="conversas transferidas"
            />
            <Metric
              icon={Utensils}
              label="Reservas normais"
              value={data.reservations.normal}
              hint="mesa comum"
            />
            <Metric
              icon={PartyPopper}
              label="Eventos personalizados"
              value={data.reservations.evento}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conversas por dia</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhuma conversa no período selecionado.
                </p>
              ) : (
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: '1px solid hsl(var(--border))',
                          background: 'hsl(var(--background))',
                        }}
                        labelFormatter={(l) => `Dia ${l}`}
                        formatter={(v: number) => [v, 'Conversas']}
                      />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {data.reservations.byStatus.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reservas por status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {data.reservations.byStatus.map((s) => (
                    <div
                      key={s.status}
                      className={cn(
                        'rounded-lg border px-4 py-2 min-w-[120px]'
                      )}
                    >
                      <p className="text-xs text-muted-foreground capitalize">{s.status}</p>
                      <p className="text-xl font-bold tabular-nums">{s.total}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
