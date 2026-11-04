import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { OnboardingChecklist } from '@/components/dashboard/OnboardingChecklist';
import { DailyOverview } from '@/components/dashboard/DailyOverview';
import { SituacaoCard } from '@/components/situacao/SituacaoCard';

/**
 * Dashboard do restaurante: só os números macro do período (conversas,
 * reservas e o que foi passado para eventos e para a equipe). Detalhe fica
 * nas telas próprias.
 */

type PresetKey = '1d' | '7d' | '15d' | '30d' | 'custom';

const PRESETS: { key: PresetKey; label: string; days: number }[] = [
  { key: '1d', label: 'Hoje', days: 1 },
  { key: '7d', label: '7 dias', days: 7 },
  { key: '15d', label: '15 dias', days: 15 },
  { key: '30d', label: '30 dias', days: 30 },
];

function getPeriodLabel(preset: PresetKey, from: Date, to: Date): string {
  if (preset === '1d') return 'hoje';
  if (preset !== 'custom') {
    const p = PRESETS.find(p => p.key === preset);
    return `últimos ${p?.days} dias`;
  }
  return `${format(from, 'dd/MM/yyyy', { locale: ptBR })} - ${format(to, 'dd/MM/yyyy', { locale: ptBR })}`;
}

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
    // "Hoje" = hoje 00:00 -> 23:59; "7 dias" = 7 dias corridos incluindo hoje.
    const from = new Date();
    from.setDate(from.getDate() - (p.days - 1));
    from.setHours(0, 0, 0, 0);
    return { dateFrom: from, dateTo: to };
  }, [preset, customFrom, customTo]);

  const periodLabel = getPeriodLabel(preset, dateFrom, dateTo);
  const { summary, isLoading } = useDashboardMetrics(dateFrom, dateTo);

  const handlePreset = (key: PresetKey) => {
    setPreset(key);
    if (key !== 'custom') {
      setCustomFrom(undefined);
      setCustomTo(undefined);
    }
  };

  return (
    <div className="space-y-6">
      {/* Situação: o que impede a IA / o WhatsApp de atender (ou "Tudo funcionando") */}
      <SituacaoCard />

      {/* Primeiros passos (some quando tudo configurado) */}
      <OnboardingChecklist />

      {/* Header + Date Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-[14px] mt-1">
            Como foi o período: conversas, reservas e o que foi passado para a equipe.
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

      {/* Os números do período */}
      <DailyOverview summary={summary} periodLabel={periodLabel} isLoading={isLoading} />
    </div>
  );
}
