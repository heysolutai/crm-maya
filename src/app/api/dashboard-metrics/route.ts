import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import type { AuthResult } from '@/lib/api/types'
import { computeAvgResponseTime } from './response-time'
import type { DailySummaryRow, DashboardSummary } from './types'

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  prevFrom: z.string().optional(),
  prevTo: z.string().optional(),
})

/** Dias do resumo diario sao os do restaurante, nao os do servidor (UTC). */
const BUSINESS_TZ = 'America/Sao_Paulo'

/** Teto de mensagens lidas pro tempo de resposta (protege periodos enormes). */
const RESPONSE_TIME_MESSAGE_CAP = 150_000

/** Teto de dias no resumo diario (periodo personalizado gigante). */
const MAX_DAILY_ROWS = 3700

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 'YYYY-MM-DD' do instante no fuso do restaurante. */
function businessDayKey(date: Date): string {
  return dayKeyFormatter.format(date)
}

/** Todos os dias (fuso do restaurante) entre from e to, inclusive. */
function listBusinessDays(from: Date, to: Date): string[] {
  const days: string[] = []
  const last = businessDayKey(to)
  // Meio-dia UTC: somar 24h nunca pula nem repete dia.
  const cursor = new Date(`${businessDayKey(from)}T12:00:00Z`)
  while (days.length < MAX_DAILY_ROWS) {
    const key = cursor.toISOString().slice(0, 10)
    if (key > last) break
    days.push(key)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

function parseDate(value: string | undefined, fallback: Date | null): Date | null {
  if (!value) return fallback
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

type DayCountRow = { day: string; total: number }
type DayTypeCountRow = { day: string; type: string; total: number }
type TypeCountRow = { type: string; total: number }
type HourCountRow = { hour: number; total: number }

/**
 * Autentica fora do try da logica de negocio. authenticate() lanca AuthError
 * (sem sessao/key invalida); aqui ela vira 401 em vez de 500.
 */
async function getAuth(req: NextRequest): Promise<{ auth: AuthResult } | { response: NextResponse }> {
  try {
    return { auth: await authenticate(req) }
  } catch (error) {
    return { response: handleApiError(error, 'Dashboard metrics auth') }
  }
}

export async function GET(req: NextRequest) {
  const result = await getAuth(req)
  if ('response' in result) return result.response
  const companyId = result.auth.companyId
  if (!companyId) {
    return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
  }

  try {
    const sp = req.nextUrl.searchParams
    const validation = querySchema.safeParse({
      from: sp.get('from') || undefined,
      to: sp.get('to') || undefined,
      prevFrom: sp.get('prevFrom') || undefined,
      prevTo: sp.get('prevTo') || undefined,
    })
    if (!validation.success) {
      return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 })
    }

    const fromDate = parseDate(validation.data.from, new Date(Date.now() - 86400000))
    const toDate = parseDate(validation.data.to, new Date())
    if (!fromDate || !toDate) {
      return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })
    }
    if (fromDate > toDate) {
      return NextResponse.json(
        { error: 'A data inicial nao pode ser maior que a final' },
        { status: 400 }
      )
    }
    const prevFromDate = parseDate(validation.data.prevFrom, null)
    const prevToDate = parseDate(validation.data.prevTo, null)

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const periodRange = { gte: fromDate, lte: toDate }
    const prevRange = prevFromDate && prevToDate ? { gte: prevFromDate, lte: prevToDate } : null

    const [
      newClientsCount,
      conversations,
      appointments,
      sales,
      prevClientsCount,
      prevSales,
      periodMessages,
      users,
      stages,
      allClients,
      departments,
      activeConversationsCount,
      todayAppointmentsCount,
      aiMessagesCount,
      aiReservationsCount,
      reservationsTotalCount,
    ] = await Promise.all([
      prisma.client.count({
        where: { companyId, createdAt: periodRange },
      }),
      prisma.conversation.findMany({
        where: { companyId, createdAt: periodRange },
        select: { id: true, aiHandled: true, departmentId: true, transferredTo: true },
      }),
      prisma.appointment.findMany({
        where: { companyId, scheduledFor: periodRange },
        select: { id: true, status: true, scheduledFor: true },
      }),
      prisma.sale.findMany({
        where: { companyId, createdAt: periodRange },
        select: { id: true, totalAmount: true, createdAt: true, soldBy: true },
      }),
      prevRange
        ? prisma.client.count({ where: { companyId, createdAt: prevRange } })
        : 0,
      prevRange
        ? prisma.sale.findMany({
            where: { companyId, createdAt: prevRange },
            select: { totalAmount: true },
          })
        : [],
      // Tempo de resposta do PERIODO (antes era so de hoje, ignorando o
      // filtro). So os campos do calculo; agregado aqui, nao vai pro browser.
      prisma.message.findMany({
        where: {
          createdAt: periodRange,
          senderType: { in: ['client', 'ai', 'agent'] },
          conversation: { companyId },
        },
        select: { createdAt: true, senderType: true, conversationId: true },
        orderBy: { createdAt: 'asc' },
        take: RESPONSE_TIME_MESSAGE_CAP,
      }),
      prisma.user.findMany({
        where: { companyId, isActive: true },
        select: { id: true, fullName: true, isOnline: true },
      }),
      prisma.funnelStage.findMany({
        where: { companyId },
        select: { id: true, name: true, orderPosition: true, isFinal: true },
        orderBy: { orderPosition: 'asc' },
      }),
      prisma.client.findMany({
        where: { companyId },
        select: { id: true, stageId: true },
      }),
      prisma.department.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true, color: true },
      }),
      prisma.conversation.count({
        where: { companyId, status: { in: ['active', 'pending'] } },
      }),
      prisma.appointment.count({
        where: {
          companyId,
          scheduledFor: { gte: todayStart, lte: todayEnd },
          status: { not: 'cancelled' },
        },
      }),
      // Restaurante: mensagens respondidas pela IA (base do "tempo economizado")
      // e reservas atribuidas a IA (card de valor).
      prisma.message.count({
        where: {
          senderType: 'ai',
          conversation: { companyId },
          createdAt: periodRange,
        },
      }),
      prisma.reservation.count({
        where: { companyId, source: 'ai', createdAt: periodRange },
      }),
      prisma.reservation.count({
        where: { companyId, createdAt: periodRange },
      }),
    ])

    // Metricas da aba "Tempo Real": estado ATUAL das conversas (nao do
    // periodo), finalizadas no periodo com comparativo, e volume de mensagens
    // por remetente no periodo. Tudo agregado no banco: nada de lista.
    // "Finalizada no periodo" = endedAt no periodo. Conversas fechadas por
    // caminhos que nao gravam endedAt (importacao de historico) caem no
    // fallback por updatedAt. NUNCA so updatedAt: qualquer edicao numa
    // conversa antiga (etiqueta, resumo) a faria contar como fechada hoje.
    const closedIn = (range: { gte: Date; lte: Date }) => ({
      companyId,
      status: 'closed' as const,
      OR: [{ endedAt: range }, { endedAt: null, updatedAt: range }],
    })

    // Resumo diario: as datas sao agrupadas no fuso do restaurante. As colunas
    // sao timestamp(3) SEM fuso guardando UTC (Prisma), por isso o duplo
    // AT TIME ZONE: 1o marca como UTC, 2o converte pra hora de Sao Paulo.
    // Tudo parametrizado (tagged template): nada de concatenacao.
    const [
      statusNow,
      statusInPeriod,
      closedInPeriod,
      prevConversationsCount,
      prevClosedCount,
      messagesBySender,
      conversationsByDay,
      reservationsByDay,
      handoffsByDay,
      handoffTotals,
      messagesByHour,
    ] = await Promise.all([
      prisma.conversation.groupBy({
        by: ['status'],
        where: { companyId, status: { in: ['active', 'pending'] } },
        _count: { _all: true },
      }),
      prisma.conversation.groupBy({
        by: ['status'],
        where: { companyId, createdAt: periodRange },
        _count: { _all: true },
      }),
      prisma.conversation.count({ where: closedIn(periodRange) }),
      prevRange ? prisma.conversation.count({ where: { companyId, createdAt: prevRange } }) : 0,
      prevRange ? prisma.conversation.count({ where: closedIn(prevRange) }) : 0,
      prisma.message.groupBy({
        by: ['senderType'],
        where: { conversation: { companyId }, createdAt: periodRange },
        _count: { _all: true },
      }),
      // Conversas por dia, SEM as de avaliacao: conversa aberta por mensagem
      // nossa (a 1a nao e do cliente) e que e de avaliacao (tem Review ou
      // passou pelo fluxo externo do n8n). Conversa normal que depois recebeu
      // a pesquisa continua contando: ela comecou com o cliente.
      prisma.$queryRaw<DayCountRow[]>`
        SELECT to_char(date_trunc('day', c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS day,
               count(*)::int AS total
        FROM conversations c
        WHERE c.company_id = ${companyId}::uuid
          AND c.created_at >= ${fromDate}
          AND c.created_at <= ${toDate}
          AND NOT (
            (
              c.resume_url_expires_at IS NOT NULL
              OR EXISTS (SELECT 1 FROM reviews r WHERE r.conversation_id = c.id AND r.company_id = c.company_id)
            )
            AND COALESCE(
              (SELECT m.sender_type::text FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.created_at ASC
                LIMIT 1),
              ''
            ) <> 'client'
          )
        GROUP BY 1
      `,
      prisma.$queryRaw<DayCountRow[]>`
        SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS day,
               count(*)::int AS total
        FROM reservations
        WHERE company_id = ${companyId}::uuid
          AND created_at >= ${fromDate}
          AND created_at <= ${toDate}
        GROUP BY 1
      `,
      // Encaminhamentos: conversas DISTINTAS por dia (a mesma conversa
      // encaminhada 2x no dia conta 1).
      prisma.$queryRaw<DayTypeCountRow[]>`
        SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS day,
               type,
               count(DISTINCT conversation_id)::int AS total
        FROM conversation_events
        WHERE company_id = ${companyId}::uuid
          AND type IN ('handoff_event', 'handoff_human')
          AND created_at >= ${fromDate}
          AND created_at <= ${toDate}
        GROUP BY 1, 2
      `,
      // Total do periodo a parte: conversa encaminhada em 2 dias diferentes
      // aparece nos 2 dias, mas conta 1 no total.
      prisma.$queryRaw<TypeCountRow[]>`
        SELECT type, count(DISTINCT conversation_id)::int AS total
        FROM conversation_events
        WHERE company_id = ${companyId}::uuid
          AND type IN ('handoff_event', 'handoff_human')
          AND created_at >= ${fromDate}
          AND created_at <= ${toDate}
        GROUP BY 1
      `,
      // Mensagens por hora do dia (fuso do restaurante) no periodo.
      prisma.$queryRaw<HourCountRow[]>`
        SELECT extract(hour FROM m.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
               count(*)::int AS total
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE c.company_id = ${companyId}::uuid
          AND m.created_at >= ${fromDate}
          AND m.created_at <= ${toDate}
        GROUP BY 1
      `,
    ])

    // === Resumo diario (preenche dias sem movimento com zero) ===
    const dailyMap = new Map<string, DailySummaryRow>()
    for (const date of listBusinessDays(fromDate, toDate)) {
      dailyMap.set(date, { date, conversations: 0, reservations: 0, handoffsEvent: 0, handoffsHuman: 0 })
    }
    const rowFor = (date: string): DailySummaryRow | undefined => dailyMap.get(date)
    for (const r of conversationsByDay) {
      const row = rowFor(r.day)
      if (row) row.conversations = Number(r.total)
    }
    for (const r of reservationsByDay) {
      const row = rowFor(r.day)
      if (row) row.reservations = Number(r.total)
    }
    for (const r of handoffsByDay) {
      const row = rowFor(r.day)
      if (!row) continue
      if (r.type === 'handoff_event') row.handoffsEvent = Number(r.total)
      else if (r.type === 'handoff_human') row.handoffsHuman = Number(r.total)
    }
    const daily = Array.from(dailyMap.values())

    const summary: DashboardSummary = {
      // Conversas criadas no periodo, sem as de avaliacao
      conversations: conversationsByDay.reduce((sum, r) => sum + Number(r.total), 0),
      reservations: reservationsTotalCount,
      reservationsByAi: aiReservationsCount,
      handoffsEvent: Number(handoffTotals.find((t) => t.type === 'handoff_event')?.total ?? 0),
      handoffsHuman: Number(handoffTotals.find((t) => t.type === 'handoff_human')?.total ?? 0),
      daily,
    }

    // === Tempo de resposta (periodo) ===
    const responseTimes = {
      overall: computeAvgResponseTime(periodMessages),
      ai: computeAvgResponseTime(periodMessages, 'ai'),
      agent: computeAvgResponseTime(periodMessages, 'agent'),
    }
    if (periodMessages.length >= RESPONSE_TIME_MESSAGE_CAP) {
      console.warn(`[dashboard-metrics] tempo de resposta truncado em ${RESPONSE_TIME_MESSAGE_CAP} mensagens (company ${companyId})`)
    }

    const hourlyMessages: number[] = Array.from({ length: 24 }, () => 0)
    for (const r of messagesByHour) {
      const h = Number(r.hour)
      if (h >= 0 && h < 24) hourlyMessages[h] = Number(r.total)
    }

    return NextResponse.json({
      statusNow: Object.fromEntries(statusNow.map((s) => [s.status, s._count._all])),
      statusInPeriod: Object.fromEntries(statusInPeriod.map((s) => [s.status, s._count._all])),
      closedInPeriod,
      prevConversationsCount,
      prevClosedCount,
      messagesBySender: Object.fromEntries(messagesBySender.map((m) => [m.senderType, m._count._all])),
      newClientsCount,
      conversations,
      appointments,
      sales,
      prevClientsCount,
      prevSales,
      responseTimes,
      hourlyMessages,
      users,
      stages,
      allClients,
      departments,
      activeConversationsCount,
      todayAppointmentsCount,
      aiMessagesCount,
      aiReservationsCount,
      reservationsTotalCount,
      summary,
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao gerar metricas do dashboard')
  }
}
