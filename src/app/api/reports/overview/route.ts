import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { z } from 'zod'

/**
 * Indicadores consolidados por periodo.
 *
 * Usado pela tela de Relatorios e pelo envio mensal automatico — os dois leem
 * daqui pra que o numero da tela e o do e-mail nunca divirjam.
 *
 * Todas as queries filtram por companyId (isolamento multi-tenant).
 */

const querySchema = z.object({
  // ISO date (YYYY-MM-DD) ou datetime completo
  from: z.string().min(1),
  to: z.string().min(1),
})

/** Cliente veio de trafego pago se tem UTM ou veio de anuncio. */
const PAID_FILTER: Prisma.ClientWhereInput = {
  OR: [
    { utmSource: { not: null, notIn: [''] } },
    { utmMedium: { not: null, notIn: [''] } },
    { utmCampaign: { not: null, notIn: [''] } },
    { adSourceUrl: { not: null, notIn: [''] } },
  ],
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }
  const companyId = auth.companyId

  try {
    const { searchParams } = new URL(req.url)
    const validation = querySchema.safeParse({
      from: searchParams.get('from') || '',
      to: searchParams.get('to') || '',
    })
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Informe o periodo (from e to)' },
        { status: 400 }
      )
    }

    const from = new Date(validation.data.from)
    const to = new Date(validation.data.to)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })
    }
    if (from > to) {
      return NextResponse.json(
        { error: 'A data inicial nao pode ser maior que a final' },
        { status: 400 }
      )
    }

    const range = { gte: from, lte: to }

    const [
      leadsNew,
      conversationsTotal,
      leadsPaid,
      reservationsTotal,
      reservationsByAi,
      humanHandoff,
      reservationsByStatus,
      conversationsByDayRaw,
    ] = await Promise.all([
      // Leads novos no periodo
      prisma.client.count({ where: { companyId, createdAt: range } }),

      // Conversas no periodo
      prisma.conversation.count({ where: { companyId, createdAt: range } }),

      // Leads vindos de trafego pago (tem UTM ou anuncio)
      prisma.client.count({ where: { companyId, createdAt: range, ...PAID_FILTER } }),

      // Reservas criadas no periodo
      prisma.reservation.count({ where: { companyId, createdAt: range } }),

      // Reservas feitas pela IA (source='ai') — o resto e humano
      prisma.reservation.count({ where: { companyId, createdAt: range, source: 'ai' } }),

      // Conversas que foram pra atendimento humano
      prisma.conversation.count({
        where: { companyId, createdAt: range, transferredTo: { not: null } },
      }),

      // Reservas quebradas por status (confirmed/cancelled/...)
      prisma.reservation.groupBy({
        by: ['status'],
        where: { companyId, createdAt: range },
        _count: { _all: true },
      }),

      // Conversas por dia. Precisa de SQL raw: o Prisma nao agrupa por
      // date_trunc. Parametrizado ($1..$3) — sem concatenacao de string.
      prisma.$queryRaw<Array<{ day: Date; total: bigint }>>`
        SELECT date_trunc('day', created_at) AS day, count(*) AS total
        FROM conversations
        WHERE company_id = ${companyId}::uuid
          AND created_at >= ${from}
          AND created_at <= ${to}
        GROUP BY 1
        ORDER BY 1
      `,
    ])

    const conversationsByDay = conversationsByDayRaw.map((r) => ({
      date: new Date(r.day).toISOString().slice(0, 10),
      total: Number(r.total),
    }))

    // Media diaria considerando os dias com movimento
    const daysWithActivity = conversationsByDay.length
    const conversationsPerDayAvg =
      daysWithActivity > 0 ? Math.round((conversationsTotal / daysWithActivity) * 10) / 10 : 0

    return NextResponse.json({
      period: { from: from.toISOString(), to: to.toISOString() },
      leads: {
        total: leadsNew,
        paid: leadsPaid,
        // Organico = tudo que nao veio marcado como trafego pago
        organic: leadsNew - leadsPaid,
      },
      conversations: {
        total: conversationsTotal,
        perDayAvg: conversationsPerDayAvg,
        byDay: conversationsByDay,
        humanHandoff,
      },
      reservations: {
        total: reservationsTotal,
        byAi: reservationsByAi,
        byHuman: reservationsTotal - reservationsByAi,
        byStatus: reservationsByStatus.map((r) => ({
          status: r.status,
          total: r._count._all,
        })),
      },
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao gerar relatorio')
  }
}
