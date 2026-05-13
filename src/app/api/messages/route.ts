import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const conversationId = req.nextUrl.searchParams.get('conversationId')
    const cursor = req.nextUrl.searchParams.get('cursor')
    const rawLimit = parseInt(req.nextUrl.searchParams.get('limit') || '50')
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 50

    if (!conversationId) return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 })

    // IDOR: filtra pelo companyId via conversation
    const where: any = { conversationId, conversation: { companyId } }
    if (cursor) where.createdAt = { lt: new Date(cursor) }

    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json(messages)
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const existing = await prisma.message.findFirst({
      where: { id, conversation: { companyId: companyId! } },
    })
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

    await prisma.message.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}
