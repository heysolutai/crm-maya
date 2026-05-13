import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const clientId = req.nextUrl.searchParams.get('clientId')
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const where = { clientId, companyId }

    const notes = await prisma.clientNote.findMany({
      where,
      include: {
        creator: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(notes)
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

const createClientNoteSchema = z.object({
  client_id: z.string().uuid(),
  note: z.string().min(1, 'Note is required'),
  company_id: z.string().uuid().optional(),
  created_by: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { companyId, agentId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const body = await req.json()
    const validation = createClientNoteSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { client_id, note } = validation.data

    // IDOR: garantir que o cliente pertence a esta empresa
    const client = await prisma.client.findFirst({
      where: { id: client_id, companyId },
      select: { id: true },
    })
    if (!client) {
      return NextResponse.json({ error: 'Cliente nao encontrado' }, { status: 404 })
    }

    const noteRecord = await prisma.clientNote.create({
      data: {
        clientId: client_id,
        companyId,
        createdBy: agentId,
        note,
      },
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

    const existing = await prisma.clientNote.findFirst({
      where: { id, companyId: companyId! },
    })
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

    await prisma.clientNote.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}
