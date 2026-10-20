import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { handleApiError } from '@/lib/api/errors'
import { UUID, requireEventAuth } from '../shared'

const createSchema = z.object({
  eventId: UUID,
  name: z.string().trim().min(1, 'Informe o nome').max(200),
  phone: z.string().trim().max(40).nullish(),
  guests: z.number().int().min(1).max(1000).nullish(),
  notes: z.string().trim().max(2000).nullish(),
})

export async function GET(req: NextRequest) {
  try {
    const a = await requireEventAuth(req, false)
    if (!a.ok) return a.response

    const sp = req.nextUrl.searchParams
    const eventId = sp.get('eventId')
    const status = sp.get('status')
    const search = (sp.get('search') || '').trim().slice(0, 100)

    if (eventId && !UUID.safeParse(eventId).success) {
      return NextResponse.json({ error: 'Evento invalido' }, { status: 400 })
    }

    const where: Prisma.EventRegistrationWhereInput = {
      companyId: a.companyId,
      ...(eventId && { eventId }),
      ...(status === 'confirmed' || status === 'cancelled' ? { status } : {}),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ],
      }),
    }

    const rows = await prisma.eventRegistration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 2000,
      select: {
        id: true,
        eventId: true,
        name: true,
        phone: true,
        guests: true,
        notes: true,
        status: true,
        source: true,
        createdAt: true,
        event: { select: { name: true } },
      },
    })

    return NextResponse.json({
      data: rows.map(({ event, ...r }) => ({ ...r, eventName: event.name })),
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao listar inscritos')
  }
}

export async function POST(req: NextRequest) {
  try {
    const a = await requireEventAuth(req, true)
    if (!a.ok) return a.response

    const body: unknown = await req.json().catch(() => null)
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const d = parsed.data

    const event = await prisma.specialEvent.findFirst({
      where: { id: d.eventId, companyId: a.companyId },
      select: { id: true },
    })
    if (!event) return NextResponse.json({ error: 'Evento invalido' }, { status: 400 })

    const created = await prisma.eventRegistration.create({
      data: {
        companyId: a.companyId,
        eventId: event.id,
        name: d.name,
        phone: d.phone || null,
        guests: d.guests ?? 1,
        notes: d.notes || null,
        status: 'confirmed',
        source: 'manual',
      },
      select: { id: true },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro ao adicionar inscrito')
  }
}
