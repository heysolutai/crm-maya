import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

const createApiKeySchema = z.object({
  companyId: z.string().uuid('Invalid companyId format'),
  name: z.string().min(1, 'Name is required'),
  key: z.string().min(1, 'Key is required'),
});

const updateApiKeySchema = z.object({
  id: z.string().uuid('Invalid id format'),
  isActive: z.boolean(),
});

export async function GET(req: NextRequest) {
  try {
    await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const keys = await prisma.apiKey.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(keys)
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { agentId } = await authenticate(req)
    const body = await req.json()
    const validation = createApiKeySchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request data', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { companyId, name, key } = validation.data

    const apiKey = await prisma.apiKey.create({
      data: {
        companyId,
        name,
        key,
        isActive: true,
        createdBy: agentId,
      },
    })
    return NextResponse.json(apiKey)
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    const body = await req.json()
    const validation = updateApiKeySchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request data', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { id, isActive } = validation.data

    const existing = await prisma.apiKey.findFirst({
      where: { id, companyId: companyId! },
    })
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

    await prisma.apiKey.update({
      where: { id },
      data: { isActive },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const existing = await prisma.apiKey.findFirst({
      where: { id, companyId: companyId! },
    })
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

    await prisma.apiKey.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
