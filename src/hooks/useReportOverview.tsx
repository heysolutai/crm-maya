import { useQuery } from '@tanstack/react-query'

/**
 * Indicadores consolidados por periodo (tela de Relatorios).
 * Le da mesma API que o envio mensal automatico usa — assim o numero da tela
 * e o do relatorio enviado nunca divergem.
 */

export interface ReportOverview {
  period: { from: string; to: string }
  leads: {
    total: number
    paid: number
    organic: number
  }
  conversations: {
    total: number
    perDayAvg: number
    byDay: Array<{ date: string; total: number }>
    humanHandoff: number
  }
  reservations: {
    total: number
    byAi: number
    byHuman: number
    byStatus: Array<{ status: string; total: number }>
    /** Reservas de mesa comum */
    normal: number
    /** Eventos personalizados (aniversario, confraternizacao, etc) */
    evento: number
  }
}

export type PeriodPreset =
  | 'today'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'custom'

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: 'Hoje',
  last7: 'Últimos 7 dias',
  last30: 'Últimos 30 dias',
  thisMonth: 'Este mês',
  lastMonth: 'Mês passado',
  thisYear: 'Este ano',
  custom: 'Personalizado',
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

/** Converte o preset em intervalo concreto. */
export function resolvePeriod(preset: PeriodPreset): { from: Date; to: Date } {
  const now = new Date()

  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) }

    case 'last7': {
      const from = new Date(now)
      from.setDate(from.getDate() - 6) // inclui hoje = 7 dias
      return { from: startOfDay(from), to: endOfDay(now) }
    }

    case 'last30': {
      const from = new Date(now)
      from.setDate(from.getDate() - 29)
      return { from: startOfDay(from), to: endOfDay(now) }
    }

    case 'thisMonth':
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: endOfDay(now),
      }

    case 'lastMonth': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      // dia 0 do mes atual = ultimo dia do mes anterior
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: startOfDay(first), to: endOfDay(last) }
    }

    case 'thisYear':
      return {
        from: startOfDay(new Date(now.getFullYear(), 0, 1)),
        to: endOfDay(now),
      }

    default:
      return { from: startOfDay(now), to: endOfDay(now) }
  }
}

export function useReportOverview(from: Date, to: Date) {
  const fromIso = from.toISOString()
  const toIso = to.toISOString()

  return useQuery<ReportOverview>({
    queryKey: ['report-overview', fromIso, toIso],
    queryFn: async () => {
      const params = new URLSearchParams({ from: fromIso, to: toIso })
      const res = await fetch(`/api/reports/overview?${params}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao carregar relatório')
      }
      return res.json()
    },
  })
}
