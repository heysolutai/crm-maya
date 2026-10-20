import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { handleApiError } from '@/lib/api/errors'
import {
  UUID,
  eventBodySchema,
  eventSelect,
  parseEventDate,
  registrationTotals,
  requireEventAuth,
} from '../shared'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = eventBodySchema.partial()

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const a = await requireEventAuth(req, false)
    if (!a.ok) return a.response
    const { id } = await ctx.params
    if (!UUID.safeParse(id).success) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const event = await prisma.specialEvent.findFirst({
      where: { id, companyId: a.companyId },
      select: eventSelect,
    })
    if (!event) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })
    const totals = await registrationTotals(a.companyId, [id])
    return NextResponse.json({
      ...event,
      registrationsCount: totals.get(id)?.registrations ?? 0,
      guestsCount: totals.get(id)?.guests ?? 0,
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao buscar evento')
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const a = await requireEventAuth(req, true)
    if (!a.ok) return a.response
    const { id } = await ctx.params
    if (!UUID.safeParse(id).success) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const body: unknown = await req.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const d = parsed.data

    const existing = await prisma.specialEvent.findFirst({
      where: { id, companyId: a.companyId },
      select: { id: true },
    })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const updated = await prisma.specialEvent.update({
      where: { id },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.description !== undefined && { description: d.description || null }),
        ...(d.priceInfo !== undefined && { priceInfo: d.priceInfo || null }),
        ...(d.eventDate !== undefined && { eventDate: parseEventDate(d.eventDate) }),
        ...(d.capacity !== undefined && { capacity: d.capacity ?? null }),
        ...(d.isActive !== undefined && { isActive: d.isActive }),
        ...(d.imageUrls !== undefined && { imageUrls: d.imageUrls }),
        ...(d.extraFields !== undefined && { extraFields: d.extraFields }),
      },
      select: eventSelect,
    })
    return NextResponse.json(updated)
  } catch (error) {
    return handleApiError(error, 'Erro ao atualizar evento')
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const a = await requireEventAuth(req, true)
    if (!a.ok) return a.response
    const { id } = await ctx.params
    if (!UUID.safeParse(id).success) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const existing = await prisma.specialEvent.findFirst({
      where: { id, companyId: a.companyId },
      select: { id: true },
    })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    await prisma.specialEvent.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro ao excluir evento')
  }
}
