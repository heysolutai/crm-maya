import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const body = await req.json()
    const companyId = body.company_id || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    // Create pipeline
    const pipeline = await prisma.pipeline.create({
      data: {
        companyId,
        name: body.name,
        description: body.description || null,
        color: body.color || '#10b981',
        departmentId: body.department_id || null,
      },
    })

    // Create stages
    const stages = body.stages && body.stages.length > 0
      ? body.stages.map((s: any, i: number) => ({
          pipelineId: pipeline.id,
          name: s.name,
          color: s.color || '#6366f1',
          orderPosition: i + 1,
          isDefault: i === 0,
          isFinal: i === body.stages.length - 1,
        }))
      : [
          { pipelineId: pipeline.id, name: 'Novo', color: '#3b82f6', orderPosition: 1, isDefault: true, isFinal: false },
          { pipelineId: pipeline.id, name: 'Em andamento', color: '#f59e0b', orderPosition: 2, isDefault: false, isFinal: false },
          { pipelineId: pipeline.id, name: 'Concluído', color: '#10b981', orderPosition: 3, isDefault: false, isFinal: true },
        ]

    await prisma.pipelineStage.createMany({ data: stages })

    return NextResponse.json(pipeline)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()
    const { id, department, pipeline_stages, stages, ...data } = body
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const pipeline = await prisma.pipeline.update({
      where: { id },
      data,
    })
    return NextResponse.json(pipeline)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await authenticate(req)
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    // Soft delete
    await prisma.pipeline.update({
      where: { id },
      data: { isActive: false },
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
