import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { isCompanyAdmin } from '@/lib/api/company-admin'
import { FUNIS, ehFunil, etapaDe } from '@/lib/solicitacoes/funis'
import { INCLUDE_CARD, paraCard } from '@/lib/solicitacoes/api'

/**
 * Uma solicitacao.
 *   PATCH  -> mover de etapa, trocar responsavel, valor ou resumo
 *   DELETE -> apagar (aberta por engano). So o admin do restaurante.
 */

type Ctx = { params: Promise<{ id: string }> }

const idSchema = z.string().uuid()

const atualizarSchema = z.object({
  stage: z.string().min(1).max(40).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  estimatedValue: z.number().min(0).max(100_000_000).nullable().optional(),
  summary: z.string().trim().max(2000).nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    const { id } = await params
    if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const parsed = atualizarSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    const body = parsed.data

    // IDOR: so solicitacao deste restaurante.
    const atual = await prisma.handoffRequest.findFirst({
      where: { id, companyId },
      select: { id: true, funnel: true, stage: true, firstResponseAt: true },
    })
    if (!atual) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })
    const funil = ehFunil(atual.funnel) ? atual.funnel : 'atendimento'

    const data: {
      stage?: string
      closedAt?: Date | null
      firstResponseAt?: Date
      assignedTo?: string | null
      estimatedValue?: number | null
      summary?: string | null
    } = {}

    if (body.stage !== undefined && body.stage !== atual.stage) {
      const etapa = etapaDe(funil, body.stage)
      if (!etapa) return NextResponse.json({ error: 'Etapa invalida' }, { status: 400 })
      data.stage = etapa.key
      data.closedAt = etapa.final ? new Date() : null
      // Saiu da entrada: alguem pegou (tempo ate atender).
      if (!atual.firstResponseAt && etapa.key !== FUNIS[funil].inicial) data.firstResponseAt = new Date()
    }

    if (body.assignedTo !== undefined) {
      if (body.assignedTo) {
        // IDOR: o responsavel vem do body, tem que ser da equipe deste restaurante.
        const usuario = await prisma.user.findFirst({
          where: { id: body.assignedTo, isActive: true, OR: [{ companyId }, { userRoles: { some: { companyId } } }] },
          select: { id: true },
        })
        if (!usuario) return NextResponse.json({ error: 'Responsavel invalido' }, { status: 400 })
      }
      data.assignedTo = body.assignedTo
    }
    if (body.estimatedValue !== undefined) data.estimatedValue = body.estimatedValue
    if (body.summary !== undefined) data.summary = body.summary || null

    await prisma.handoffRequest.updateMany({ where: { id, companyId }, data })
    const atualizada = await prisma.handoffRequest.findFirst({ where: { id, companyId }, include: INCLUDE_CARD })
    if (!atualizada) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })
    return NextResponse.json(paraCard(atualizada))
  } catch (error) {
    return handleApiError(error, 'Erro ao atualizar solicitacao')
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await authenticate(req)
    if (!auth.companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    if (!(await isCompanyAdmin(auth))) {
      return NextResponse.json({ error: 'Apenas o administrador do restaurante pode apagar solicitacoes' }, { status: 403 })
    }

    const { id } = await params
    if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const apagadas = await prisma.handoffRequest.deleteMany({ where: { id, companyId: auth.companyId } })
    if (!apagadas.count) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro ao apagar solicitacao')
  }
}
