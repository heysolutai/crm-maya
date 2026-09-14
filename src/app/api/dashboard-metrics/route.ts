import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const from = req.nextUrl.searchParams.get('from') || new Date(Date.now() - 86400000).toISOString()
    const to = req.nextUrl.searchParams.get('to') || new Date().toISOString()
    const prevFrom = req.nextUrl.searchParams.get('prevFrom')
    const prevTo = req.nextUrl.searchParams.get('prevTo')

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const [
      newClientsCount,
      conversations,
      appointments,
      sales,
      prevClientsCount,
      prevSales,
      todayMessages,
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
        where: { companyId, createdAt: { gte: new Date(from), lte: new Date(to) } },
      }),
      prisma.conversation.findMany({
        where: { companyId, createdAt: { gte: new Date(from), lte: new Date(to) } },
        select: { id: true, aiHandled: true, departmentId: true, transferredTo: true },
      }),
      prisma.appointment.findMany({
        where: { companyId, scheduledFor: { gte: new Date(from), lte: new Date(to) } },
        select: { id: true, status: true, scheduledFor: true },
      }),
      prisma.sale.findMany({
        where: { companyId, createdAt: { gte: new Date(from), lte: new Date(to) } },
        select: { id: true, totalAmount: true, createdAt: true, soldBy: true },
      }),
      prevFrom && prevTo
        ? prisma.client.count({
            where: { companyId, createdAt: { gte: new Date(prevFrom), lte: new Date(prevTo) } },
          })
        : 0,
      prevFrom && prevTo
        ? prisma.sale.findMany({
            where: { companyId, createdAt: { gte: new Date(prevFrom), lte: new Date(prevTo) } },
            select: { totalAmount: true },
          })
        : [],
      prisma.message.findMany({
        where: {
          createdAt: { gte: todayStart, lte: todayEnd },
          conversation: { companyId },
        },
        select: { id: true, createdAt: true, senderType: true, conversationId: true },
        orderBy: { createdAt: 'asc' },
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
          createdAt: { gte: new Date(from), lte: new Date(to) },
        },
      }),
      prisma.reservation.count({
        where: { companyId, source: 'ai', createdAt: { gte: new Date(from), lte: new Date(to) } },
      }),
      prisma.reservation.count({
        where: { companyId, createdAt: { gte: new Date(from), lte: new Date(to) } },
      }),
    ])

    // Metricas da aba "Tempo Real": estado ATUAL das conversas (nao do
    // periodo), finalizadas no periodo com comparativo, e volume de mensagens
    // por remetente no periodo. Tudo agregado no banco: nada de lista.
    const periodRange = { gte: new Date(from), lte: new Date(to) }
    const prevRange = prevFrom && prevTo ? { gte: new Date(prevFrom), lte: new Date(prevTo) } : null
    // "Finalizada no periodo" = endedAt no periodo. Conversas fechadas por
    // caminhos que nao gravam endedAt (importacao de historico) caem no
    // fallback por updatedAt. NUNCA so updatedAt: qualquer edicao numa
    // conversa antiga (etiqueta, resumo) a faria contar como fechada hoje.
    const closedIn = (range: { gte: Date; lte: Date }) => ({
      companyId,
      status: 'closed' as const,
      OR: [{ endedAt: range }, { endedAt: null, updatedAt: range }],
    })
    const [statusNow, statusInPeriod, closedInPeriod, prevConversationsCount, prevClosedCount, messagesBySender] =
      await Promise.all([
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
      ])

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
      todayMessages,
      users,
      stages,
      allClients,
      departments,
      activeConversationsCount,
      todayAppointmentsCount,
      aiMessagesCount,
      aiReservationsCount,
      reservationsTotalCount,
    })
  } catch (error) {
    return handleApiError(error, 'Erro')}
}
