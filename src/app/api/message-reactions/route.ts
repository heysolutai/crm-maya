import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const messageIds = req.nextUrl.searchParams.get('messageIds')
    if (!messageIds) return NextResponse.json({ error: 'Missing messageIds' }, { status: 400 })

    // Filtra IDs invalidos (frontend manda IDs otimistas tipo "temp-XXX" pra
    // mensagens ainda nao persistidas — Postgres rejeita esses como UUID).
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const ids = messageIds.split(',').map((s) => s.trim()).filter((s) => UUID_RE.test(s))

    if (ids.length === 0) return NextResponse.json({})

    // IDOR: filtra apenas reactions de mensagens em conversas da empresa
    const reactions = await prisma.messageReaction.findMany({
      where: { messageId: { in: ids }, message: { conversation: { companyId } } },
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
    return handleApiError(error, 'Erro')
  }
}
