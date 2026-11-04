"use client";

import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageSquare, UtensilsCrossed, PartyPopper, Headset } from 'lucide-react';
import { BarChart, Bar, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import type { DailySummaryRow, DashboardSummary } from '@/app/api/dashboard-metrics/types';

/**
 * Os números macro do dashboard: conversas, reservas e encaminhamentos
 * (eventos / equipe) no periodo do filtro, com uma barrinha por dia em cada
 * card (o numero do dia aparece ao passar o mouse).
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
          title="Reservas"
          value={summary.reservations}
          subtitle={periodLabel}
          detail={`${formatNumber(summary.reservationsByAi)} pela IA`}
          icon={UtensilsCrossed}
          daily={daily}
          dataKey="reservations"
          isLoading={isLoading}
        />
        <SummaryCard
          title="Passadas para eventos"
          value={summary.handoffsEvent}
          subtitle={periodLabel}
          icon={PartyPopper}
          daily={daily}
          dataKey="handoffsEvent"
          isLoading={isLoading}
        />
        <SummaryCard
          title="Passadas para a equipe"
          value={summary.handoffsHuman}
          subtitle={periodLabel}
          icon={Headset}
          daily={daily}
          dataKey="handoffsHuman"
          isLoading={isLoading}
        />
      </div>

      <p className="px-1 text-[11px] leading-snug text-muted-foreground">
        Conversas não contam as pesquisas de avaliação. Passagens contadas desde {HANDOFFS_SINCE}.
      </p>
    </section>
  );
}
