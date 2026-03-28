import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    // Users who have been seen in the last 2 minutes are considered online
    const cutoff = new Date(Date.now() - 2 * 60 * 1000)

    const onlineUsers = await prisma.user.findMany({
      where: {
        companyId,
        isOnline: true,
        lastSeenAt: { gte: cutoff },
      },
      select: { id: true },
    })

    return NextResponse.json({ onlineUserIds: onlineUsers.map(u => u.id) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
