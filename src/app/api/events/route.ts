import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { handleApiError } from '@/lib/api/errors'
import { eventBodySchema, eventSelect, parseEventDate, registrationTotals, requireEventAuth } from './shared'

export async function GET(req: NextRequest) {
  try {
    const a = await requireEventAuth(req, false)
    if (!a.ok) return a.response

    const events = await prisma.specialEvent.findMany({
      where: { companyId: a.companyId },
      select: eventSelect,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })
    const totals = await registrationTotals(a.companyId, events.map((e) => e.id))

    return NextResponse.json({
      data: events.map((e) => ({
        ...e,
        registrationsCount: totals.get(e.id)?.registrations ?? 0,
        guestsCount: totals.get(e.id)?.guests ?? 0,
      })),
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao listar eventos')
  }
}

export async function POST(req: NextRequest) {
  try {
    const a = await requireEventAuth(req, true)
    if (!a.ok) return a.response

    const body: unknown = await req.json().catch(() => null)
    const parsed = eventBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const d = parsed.data

    const event = await prisma.specialEvent.create({
      data: {
        companyId: a.companyId,
        name: d.name,
        description: d.description || null,
        priceInfo: d.priceInfo || null,
        eventDate: parseEventDate(d.eventDate),
        capacity: d.capacity ?? null,
        isActive: d.isActive ?? true,
        imageUrls: d.imageUrls ?? [],
        extraFields: d.extraFields ?? [],
      },
      select: eventSelect,
    })
    return NextResponse.json({ ...event, registrationsCount: 0, guestsCount: 0 }, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro ao criar evento')
  }
}
