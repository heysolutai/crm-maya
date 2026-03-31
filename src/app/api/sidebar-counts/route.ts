import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const [appointmentsToday, pendingFollowUps] = await Promise.all([
      prisma.appointment.count({
        where: {
          companyId,
          scheduledFor: { gte: todayStart, lte: todayEnd },
          status: { in: ['scheduled', 'confirmed'] },
        },
      }),
      prisma.followUpJob.count({
        where: { companyId, status: 'pending' },
      }),
    ])

    return NextResponse.json({ appointmentsToday, pendingFollowUps })
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
