import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const startOfDay = req.nextUrl.searchParams.get('startOfDay')
    const endOfDay = req.nextUrl.searchParams.get('endOfDay')
    const dateStr = req.nextUrl.searchParams.get('dateStr')

    if (!startOfDay || !endOfDay) {
      return NextResponse.json({ error: 'Missing date range' }, { status: 400 })
    }

    const dayStart = new Date(startOfDay)
    const dayEnd = new Date(endOfDay)

    const [
      crmEntriesData,
      crmScheduledData,
      crmScheduledTodayData,
      todayAppointments,
      todaySales,
      existingReport,
      reportHistory,
    ] = await Promise.all([
      prisma.client.findMany({
        where: { companyId, createdAt: { gte: dayStart, lte: dayEnd } },
        select: { id: true, firstName: true, lastName: true, fullName: true, phone: true, source: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.appointment.findMany({
        where: { companyId, createdAt: { gte: dayStart, lte: dayEnd } },
        select: {
          id: true, title: true, scheduledFor: true, status: true, patientName: true,
          clientId: true, notes: true,
          client: { select: { id: true, firstName: true, lastName: true, fullName: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.appointment.findMany({
        where: { companyId, scheduledFor: { gte: dayStart, lte: dayEnd } },
        select: {
          id: true, title: true, scheduledFor: true, status: true, patientName: true,
          clientId: true, notes: true,
          client: { select: { id: true, firstName: true, lastName: true, fullName: true, phone: true } },
        },
        orderBy: { scheduledFor: 'asc' },
      }),
      prisma.appointment.findMany({
        where: { companyId, scheduledFor: { gte: dayStart, lte: dayEnd } },
        select: {
          id: true, title: true, scheduledFor: true, status: true, patientName: true,
          clientId: true, notes: true,
          client: { select: { id: true, firstName: true, lastName: true, fullName: true } },
        },
        orderBy: { scheduledFor: 'asc' },
      }),
      prisma.sale.findMany({
        where: { companyId, createdAt: { gte: dayStart, lte: dayEnd } },
        select: {
          id: true, totalAmount: true, items: true, clientId: true, saleNumber: true,
          client: { select: { firstName: true, lastName: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      dateStr
        ? prisma.dailyReport.findFirst({
            where: { companyId, reportDate: dateStr },
          })
        : null,
      prisma.dailyReport.findMany({
        where: { companyId },
        orderBy: { reportDate: 'desc' },
        take: 30,
      }),
    ])

    return NextResponse.json({
      crmEntriesData,
      crmScheduledData,
      crmScheduledTodayData,
      todayAppointments,
      todaySales,
      existingReport,
      reportHistory,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
