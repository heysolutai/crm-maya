import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    await authenticate(req)
    const conversationIds = req.nextUrl.searchParams.get('conversationIds')
    const cutoffHours = parseInt(req.nextUrl.searchParams.get('cutoffHours') || '48')

    if (!conversationIds) return NextResponse.json({ error: 'Missing conversationIds' }, { status: 400 })

    const ids = conversationIds.split(',')
    const cutoffDate = new Date(Date.now() - cutoffHours * 60 * 60 * 1000)

    const unreadMessages = await prisma.message.findMany({
      where: {
        conversationId: { in: ids },
        senderType: 'client',
        isRead: false,
        createdAt: { gte: cutoffDate },
      },
      select: { conversationId: true },
    })

    const countMap: Record<string, number> = {}
    for (const msg of unreadMessages) {
      countMap[msg.conversationId] = (countMap[msg.conversationId] || 0) + 1
    }

    return NextResponse.json(countMap)
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
