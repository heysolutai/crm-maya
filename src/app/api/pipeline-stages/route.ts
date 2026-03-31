import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

const createStageSchema = z.object({
  pipeline_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  color: z.string().optional(),
  order_position: z.number().int().optional(),
  is_default: z.boolean().optional(),
  is_final: z.boolean().optional(),
})

const updateStageSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  color: z.string().optional(),
  orderPosition: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  isFinal: z.boolean().optional(),
})

const reorderStagesSchema = z.object({
  id: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()),
})

export async function GET(req: NextRequest) {
  try {
    await authenticate(req)
    const pipelineId = req.nextUrl.searchParams.get('pipelineId')
    if (!pipelineId) return NextResponse.json({ error: 'Missing pipelineId' }, { status: 400 })

    const stages = await prisma.pipelineStage.findMany({
      where: { pipelineId },
      orderBy: { orderPosition: 'asc' },
    })
    return NextResponse.json(stages)
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()

    const validation = createStageSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const stage = await prisma.pipelineStage.create({
      data: {
        pipelineId: validation.data.pipeline_id,
        name: validation.data.name,
        color: validation.data.color || '#6366f1',
        orderPosition: validation.data.order_position ?? 0,
        isDefault: validation.data.is_default ?? false,
        isFinal: validation.data.is_final ?? false,
      },
    })
    return NextResponse.json(stage, { status: 201 })
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const body = await req.json()

    // Handle reorder (array of ordered IDs)
    if (body.orderedIds && Array.isArray(body.orderedIds)) {
      const reorderValidation = reorderStagesSchema.safeParse(body)
      if (!reorderValidation.success) {
        return NextResponse.json(
          { error: 'Dados invalidos', details: reorderValidation.error.flatten().fieldErrors },
          { status: 400 }
        )
      }
      for (let i = 0; i < reorderValidation.data.orderedIds.length; i++) {
        const existingStage = await prisma.pipelineStage.findFirst({
          where: { id: reorderValidation.data.orderedIds[i], pipeline: { companyId } },
        })
        if (!existingStage) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })
        await prisma.pipelineStage.update({
          where: { id: reorderValidation.data.orderedIds[i] },
          data: { orderPosition: i + 1 },
        })
      }
      return NextResponse.json({ success: true })
    }

    const validation = updateStageSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id, ...data } = validation.data

    const existing = await prisma.pipelineStage.findFirst({
      where: { id, pipeline: { companyId } },
    })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const stage = await prisma.pipelineStage.update({
      where: { id },
      data,
    })
    return NextResponse.json(stage)
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const id = req.nextUrl.searchParams.get('id')
    const fallbackStageId = req.nextUrl.searchParams.get('fallbackStageId')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const existing = await prisma.pipelineStage.findFirst({
      where: { id, pipeline: { companyId } },
    })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    // Move clients to fallback stage if provided
    if (fallbackStageId) {
      await prisma.client.updateMany({
        where: { stageId: id },
        data: { stageId: fallbackStageId },
      })
    }

    await prisma.pipelineStage.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
