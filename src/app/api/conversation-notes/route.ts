import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { publishEvent } from '@/lib/realtime'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const conversationId = req.nextUrl.searchParams.get('conversationId')
    if (!conversationId) return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 })

    // IDOR: garante que a conversa pertence a empresa autenticada
    const notes = await prisma.conversationNote.findMany({
      where: { conversationId, companyId },
      include: {
        creator: { select: { fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(notes)
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

const createConversationNoteSchema = z.object({
  conversation_id: z.string().uuid(),
  note: z.string().min(1, 'Note is required'),
  company_id: z.string().uuid().optional(),
  created_by: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { companyId, agentId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const body = await req.json()
    const validation = createConversationNoteSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { conversation_id, note } = validation.data

    // IDOR: garante que a conversa pertence a empresa autenticada antes de criar nota
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversation_id, companyId },
      select: { id: true },
    })
    if (!conversation) {
      return NextResponse.json({ error: 'Conversa nao encontrada' }, { status: 404 })
    }

    const noteRecord = await prisma.conversationNote.create({
      data: {
        conversationId: conversation_id,
        companyId,
        createdBy: agentId,
        note,
      },
      include: {
        creator: { select: { fullName: true, avatarUrl: true } },
      },
    })

    // Publica evento realtime pra nota aparecer no chat sem refresh
    await publishEvent(companyId, {
      type: 'note:new',
      conversationId: conversation_id,
      note: noteRecord,
    })

    return NextResponse.json(noteRecord)
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const existing = await prisma.conversationNote.findFirst({
      where: { id, companyId: companyId! },
    })
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

    await prisma.conversationNote.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}
