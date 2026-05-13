import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const { conversationId } = await req.json()

    if (!conversationId) {
      return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 })
    }

    // IDOR: garante que a conversa pertence a empresa
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, companyId },
      select: { id: true },
    })
    if (!conversation) {
      return NextResponse.json({ error: 'Conversa nao encontrada' }, { status: 404 })
    }

    await prisma.message.updateMany({
      where: {
        conversationId,
        senderType: 'client',
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro')}
}
