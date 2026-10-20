/**
 * Formato do bloco `summary` de GET /api/dashboard-metrics (topo do dashboard).
 * Compartilhado com o hook useDashboardMetrics (import type).
 */
export interface DailySummaryRow {
  /** Dia no fuso America/Sao_Paulo, 'YYYY-MM-DD' */
  date: string
  conversations: number
  reservations: number
  handoffsEvent: number
  handoffsHuman: number
}

export interface DashboardSummary {
  /** Conversas criadas no periodo (sem as de avaliacao) */
  conversations: number
  /** Reservas criadas no periodo, todas as origens */
  reservations: number
  /** Reservas criadas pela IA (source 'ai') */
  reservationsByAi: number
  /** Conversas distintas encaminhadas p/ eventos no periodo */
  handoffsEvent: number
  /** Conversas distintas encaminhadas p/ atendimento humano no periodo */
  handoffsHuman: number
  /** Uma linha por dia do periodo, dias sem movimento com zero */
  daily: DailySummaryRow[]
}
