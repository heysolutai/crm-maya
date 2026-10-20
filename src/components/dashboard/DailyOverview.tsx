"use client";

import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageSquare, UtensilsCrossed, PartyPopper, Headset, CalendarDays } from 'lucide-react';
import { BarChart, Bar, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { DailySummaryRow, DashboardSummary } from '@/app/api/dashboard-metrics/types';

/**
 * Topo do dashboard: o que o restaurante pediu pra acompanhar por data.
 * Conversas, reservas feitas e encaminhamentos (eventos / humano) no periodo
 * do filtro, com uma barrinha por dia em cada card e a tabela dia a dia.
 */

// Inicio da contagem de encaminhamentos (deploy da tabela de eventos).
const HANDOFFS_SINCE = '04/10/2026';

type SeriesKey = 'conversations' | 'reservations' | 'handoffsEvent' | 'handoffsHuman';

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--background))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  fontSize: 12,
  padding: '6px 10px',
};

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatDay(date: string, pattern: string): string {
  try {
    return format(parseISO(date), pattern, { locale: ptBR });
  } catch {
    return date;
  }
}

/** Uma barra por dia: so a tendencia, o numero exato fica no tooltip/tabela. */
function DailySparkline({
  data,
  dataKey,
  label,
}: {
  data: DailySummaryRow[];
  dataKey: SeriesKey;
  label: string;
}) {
  return (
    <div className="mt-3 h-11 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barCategoryGap={2}>
          <RechartsTooltip
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
            itemStyle={{ color: 'hsl(var(--foreground))' }}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as DailySummaryRow | undefined;
              return row ? formatDay(row.date, "EEE dd/MM") : '';
            }}
            formatter={(v: number) => [formatNumber(v), label]}
          />
          <Bar
            dataKey={dataKey}
            fill="hsl(var(--primary))"
            radius={[3, 3, 0, 0]}
            maxBarSize={14}
            minPointSize={1}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  detail,
  icon: Icon,
  daily,
  dataKey,
  isLoading,
}: {
  title: string;
  value: number;
  subtitle: string;
  detail?: string;
  icon: React.ElementType;
  daily: DailySummaryRow[];
  dataKey: SeriesKey;
  isLoading?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] sm:p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </span>
        <p className="min-w-0 text-[12.5px] font-semibold leading-tight text-foreground sm:text-[13px]">{title}</p>
      </div>

      {isLoading ? (
        <>
          <Skeleton className="mt-3 h-8 w-16" />
          <Skeleton className="mt-3 h-11 w-full" />
        </>
      ) : (
        <>
          <p className="mt-3 text-[28px] font-bold leading-none tracking-tight tabular-nums sm:text-[32px]">
            {formatNumber(value)}
          </p>
          <p className="mt-1.5 truncate text-[11px] font-medium text-muted-foreground" title={subtitle}>
            {subtitle}
          </p>
          {detail && <p className="truncate text-[11px] text-muted-foreground">{detail}</p>}
          {daily.length > 1 && <DailySparkline data={daily} dataKey={dataKey} label={title} />}
        </>
      )}
    </div>
  );
}

export function DailyOverview({
  summary,
  periodLabel,
  isLoading,
}: {
  summary: DashboardSummary;
  periodLabel: string;
  isLoading?: boolean;
}) {
  const { daily } = summary;
  // Mais recente primeiro: e o que a pessoa procura ao abrir.
  const rows = [...daily].reverse();

  return (
    <section className="space-y-3" aria-label="Resumo do período">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <SummaryCard
          title="Conversas"
          value={summary.conversations}
          subtitle={periodLabel}
          icon={MessageSquare}
          daily={daily}
          dataKey="conversations"
          isLoading={isLoading}
        />
        <SummaryCard
          title="Reservas feitas"
          value={summary.reservations}
          subtitle={periodLabel}
          detail={`${formatNumber(summary.reservationsByAi)} pela IA`}
          icon={UtensilsCrossed}
          daily={daily}
          dataKey="reservations"
          isLoading={isLoading}
        />
        <SummaryCard
          title="Encaminhadas p/ eventos"
          value={summary.handoffsEvent}
          subtitle={periodLabel}
          icon={PartyPopper}
          daily={daily}
          dataKey="handoffsEvent"
          isLoading={isLoading}
        />
        <SummaryCard
          title="Encaminhadas p/ humano"
          value={summary.handoffsHuman}
          subtitle={periodLabel}
          icon={Headset}
          daily={daily}
          dataKey="handoffsHuman"
          isLoading={isLoading}
        />
      </div>

      <p className="px-1 text-[11px] leading-snug text-muted-foreground">
        Encaminhamentos contados a partir de {HANDOFFS_SINCE}. Conversas não incluem as pesquisas de avaliação.
      </p>

      {/* Tabela dia a dia: so faz sentido com mais de um dia no periodo */}
      {!isLoading && rows.length > 1 && (
        <div className="rounded-2xl border border-border/60 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-2 px-4 pt-4 pb-3 sm:px-5">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h3 className="text-[15px] font-semibold tracking-tight">Por dia</h3>
          </div>
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full text-[12.5px] tabular-nums">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pl-4 pr-2 text-left font-semibold sm:pl-5">Data</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">Conversas</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">Reservas</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">
                    <span className="hidden sm:inline">Encam. </span>Eventos
                  </th>
                  <th scope="col" className="py-2 pl-2 pr-4 text-right font-semibold sm:pr-5">
                    <span className="hidden sm:inline">Encam. </span>Humano
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const empty =
                    row.conversations === 0 &&
                    row.reservations === 0 &&
                    row.handoffsEvent === 0 &&
                    row.handoffsHuman === 0;
                  return (
                    <tr
                      key={row.date}
                      className={cn('border-b border-border/40 last:border-0', empty && 'text-muted-foreground')}
                    >
                      <th scope="row" className="whitespace-nowrap py-2 pl-4 pr-2 text-left font-medium sm:pl-5">
                        <span className="capitalize text-muted-foreground">{formatDay(row.date, 'EEE')}</span>{' '}
                        {formatDay(row.date, 'dd/MM')}
                      </th>
                      <td className="px-2 py-2 text-right font-semibold">{formatNumber(row.conversations)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.reservations)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.handoffsEvent)}</td>
                      <td className="py-2 pl-2 pr-4 text-right sm:pr-5">{formatNumber(row.handoffsHuman)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
