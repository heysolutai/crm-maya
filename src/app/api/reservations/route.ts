import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

// Reservas atribuidas (restaurante). A IA (via N8N, com x-api-key) ou o
// atendente cria um registro ao confirmar a reserva. source='ai' alimenta o
// card "Reservas pela IA" do dashboard.
const createSchema = z.object({
  source: z.enum(['ai', 'agent', 'manual']).optional().default('ai'),
  customerName: z.string().max(255).optional().nullable(),
  partySize: z.number().int().positive().max(1000).optional().nullable(),
  reservedFor: z.string().datetime().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  conversationId: z.string().uuid().optional().nullable(),
  status: z.enum(['confirmed', 'cancelled', 'no_show']).optional().default('confirmed'),
  notes: z.string().max(2000).optional().nullable(),
})

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const source = searchParams.get('source')

    const reservations = await prisma.reservation.findMany({
      where: {
        companyId: auth.companyId,
        ...(source ? { source } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return NextResponse.json(reservations)
  } catch (error) {
    return handleApiError(error, 'Erro ao listar reservas')
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const validation = createSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const d = validation.data

    // IDOR: clientId / conversationId (se vierem) precisam ser da empresa.
    if (d.clientId) {
      const client = await prisma.client.findFirst({
        where: { id: d.clientId, companyId: auth.companyId },
        select: { id: true },
      })
      if (!client) return NextResponse.json({ error: 'Cliente invalido' }, { status: 400 })
    }
    if (d.conversationId) {
      const conv = await prisma.conversation.findFirst({
        where: { id: d.conversationId, companyId: auth.companyId },
        select: { id: true },
      })
      if (!conv) return NextResponse.json({ error: 'Conversa invalida' }, { status: 400 })
    }

    const reservation = await prisma.reservation.create({
      data: {
        companyId: auth.companyId,
        source: d.source,
        customerName: d.customerName ?? null,
        partySize: d.partySize ?? null,
        reservedFor: d.reservedFor ? new Date(d.reservedFor) : null,
        clientId: d.clientId ?? null,
        conversationId: d.conversationId ?? null,
        status: d.status,
        notes: d.notes ?? null,
      },
    })

    return NextResponse.json(reservation, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro ao criar reserva')
  }
}
