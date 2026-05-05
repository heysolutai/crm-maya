import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
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
    return handleApiError(error, 'Erro')}
}
