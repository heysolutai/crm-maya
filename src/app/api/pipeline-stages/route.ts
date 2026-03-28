import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()

    const stage = await prisma.pipelineStage.create({
      data: {
        pipelineId: body.pipeline_id,
        name: body.name,
        color: body.color || '#6366f1',
        orderPosition: body.order_position ?? 0,
        isDefault: body.is_default ?? false,
        isFinal: body.is_final ?? false,
      },
    })
    return NextResponse.json(stage)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()
    const { id, ...data } = body
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    // Handle reorder (array of ordered IDs)
    if (body.orderedIds && Array.isArray(body.orderedIds)) {
      for (let i = 0; i < body.orderedIds.length; i++) {
        await prisma.pipelineStage.update({
          where: { id: body.orderedIds[i] },
          data: { orderPosition: i + 1 },
        })
      }
      return NextResponse.json({ success: true })
    }

    const stage = await prisma.pipelineStage.update({
      where: { id },
      data,
    })
    return NextResponse.json(stage)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await authenticate(req)
    const id = req.nextUrl.searchParams.get('id')
    const fallbackStageId = req.nextUrl.searchParams.get('fallbackStageId')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    // Move clients to fallback stage if provided
    if (fallbackStageId) {
      await prisma.client.updateMany({
        where: { stageId: id },
        data: { stageId: fallbackStageId },
      })
    }

    await prisma.pipelineStage.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
