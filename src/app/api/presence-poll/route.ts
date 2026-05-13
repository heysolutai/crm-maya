import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

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
  } catch (error) {
    return handleApiError(error, 'Erro')}
}
