import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { z } from 'zod'

const createFunnelStageSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'Invalid color format').optional(),
  order_position: z.number().int().optional(),
  orderPosition: z.number().int().optional(),
  is_default: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  is_final: z.boolean().optional(),
  isFinal: z.boolean().optional(),
  company_id: z.string().uuid().optional(),
})

const updateFunnelStageSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'Invalid color format').optional(),
  orderPosition: z.number().int().optional(),
  order_position: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  is_default: z.boolean().optional(),
  isFinal: z.boolean().optional(),
  is_final: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const stages = await prisma.funnelStage.findMany({
      where: { companyId },
      orderBy: { orderPosition: 'asc' },
    })
    return NextResponse.json(stages)
  } catch (error) {
    console.error('Erro ao buscar etapas do funil:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const body = await req.json()

    const validation = createFunnelStageSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const data = validation.data
    const companyId = data.company_id || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const stage = await prisma.funnelStage.create({
      data: {
        companyId,
        name: data.name,
        description: data.description,
        orderPosition: data.order_position ?? data.orderPosition ?? 0,
        color: data.color || '#6366f1',
        isDefault: data.is_default ?? data.isDefault ?? false,
        isFinal: data.is_final ?? data.isFinal ?? false,
      },
    })
    return NextResponse.json(stage, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar etapa do funil:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const body = await req.json()

    const validation = updateFunnelStageSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id, ...data } = validation.data

    const existing = await prisma.funnelStage.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const stage = await prisma.funnelStage.update({ where: { id }, data })
    return NextResponse.json(stage)
  } catch (error) {
    console.error('Erro ao atualizar etapa do funil:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const existing = await prisma.funnelStage.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    await prisma.funnelStage.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao deletar etapa do funil:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
