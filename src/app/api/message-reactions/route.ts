import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    await authenticate(req)
    const messageIds = req.nextUrl.searchParams.get('messageIds')
    if (!messageIds) return NextResponse.json({ error: 'Missing messageIds' }, { status: 400 })

    const ids = messageIds.split(',')

    const reactions = await prisma.messageReaction.findMany({
      where: { messageId: { in: ids } },
      include: { user: { select: { fullName: true } } },
    })

    // Group by message_id
    const map: Record<string, any[]> = {}
    for (const r of reactions) {
      if (!map[r.messageId]) map[r.messageId] = []
      map[r.messageId].push({
        id: r.id,
        message_id: r.messageId,
        user_id: r.userId,
        emoji: r.emoji,
        users: r.user ? { full_name: r.user.fullName } : null,
      })
    }

    return NextResponse.json(map)
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
