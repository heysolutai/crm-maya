import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
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
        where: { companyId, status: { in: ['active', 'waiting'] } },
      }),
      prisma.appointment.count({
        where: {
          companyId,
          scheduledFor: { gte: todayStart, lte: todayEnd },
          status: { not: 'cancelled' },
        },
      }),
    ])

    return NextResponse.json({
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
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
