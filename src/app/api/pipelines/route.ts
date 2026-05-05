import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

const stageSchema = z.object({
  name: z.string().max(255),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'Invalid color format').optional(),
})

const createPipelineSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'Invalid color format').optional(),
  department_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().optional(),
  stages: z.array(stageSchema).optional(),
})

const updatePipelineSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'Invalid color format').optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const pipelines = await prisma.pipeline.findMany({
      where: { companyId, isActive: true },
      include: {
        department: { select: { id: true, name: true, color: true } },
        stages: {
          select: { id: true, name: true, color: true, orderPosition: true, isDefault: true, isFinal: true },
          orderBy: { orderPosition: 'asc' },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json(pipelines)
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const body = await req.json()

    const validation = createPipelineSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const companyId = validation.data.company_id || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    // Create pipeline
    const pipeline = await prisma.pipeline.create({
      data: {
        companyId,
        name: validation.data.name,
        description: validation.data.description || null,
        color: validation.data.color || '#10b981',
        departmentId: validation.data.department_id || null,
      },
    })

    // Create stages
    const stages = validation.data.stages && validation.data.stages.length > 0
      ? validation.data.stages.map((s, i) => ({
          pipelineId: pipeline.id,
          name: s.name,
          color: s.color || '#6366f1',
          orderPosition: i + 1,
          isDefault: i === 0,
          isFinal: i === validation.data.stages!.length - 1,
        }))
      : [
          { pipelineId: pipeline.id, name: 'Novo', color: '#3b82f6', orderPosition: 1, isDefault: true, isFinal: false },
          { pipelineId: pipeline.id, name: 'Em andamento', color: '#f59e0b', orderPosition: 2, isDefault: false, isFinal: false },
          { pipelineId: pipeline.id, name: 'Concluído', color: '#10b981', orderPosition: 3, isDefault: false, isFinal: true },
        ]

    await prisma.pipelineStage.createMany({ data: stages })

    return NextResponse.json(pipeline, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const body = await req.json()

    const validation = updatePipelineSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id, ...data } = validation.data

    const existing = await prisma.pipeline.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const pipeline = await prisma.pipeline.update({
      where: { id },
      data,
    })
    return NextResponse.json(pipeline)
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const existing = await prisma.pipeline.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    // Soft delete
    await prisma.pipeline.update({
      where: { id },
      data: { isActive: false },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}
