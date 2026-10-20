import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { handleApiError } from '@/lib/api/errors'
import { UUID, requireEventAuth } from '../../shared'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({ status: z.enum(['confirmed', 'cancelled']) })

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const a = await requireEventAuth(req, true)
    if (!a.ok) return a.response
    const { id } = await ctx.params
    if (!UUID.safeParse(id).success) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const body: unknown = await req.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })

    const result = await prisma.eventRegistration.updateMany({
      where: { id, companyId: a.companyId },
      data: { status: parsed.data.status },
    })
    if (result.count === 0) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro ao atualizar inscrito')
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const a = await requireEventAuth(req, true)
    if (!a.ok) return a.response
    const { id } = await ctx.params
    if (!UUID.safeParse(id).success) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const result = await prisma.eventRegistration.deleteMany({ where: { id, companyId: a.companyId } })
    if (result.count === 0) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro ao excluir inscrito')
  }
}
