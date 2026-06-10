import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { logAction } from '@/lib/services/audit'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { handleApiError } from '@/lib/api/errors'

const createClientSchema = z.object({
  firstName: z.string().min(1).max(255).optional(),
  first_name: z.string().min(1).max(255).optional(),
  lastName: z.string().max(255).optional(),
  last_name: z.string().max(255).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  secondaryPhone: z.string().max(50).optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  tags: z.array(z.string()).optional(),
  gender: z.string().max(20).optional().nullable(),
  documentNumber: z.string().max(50).optional().nullable(),
  address: z.any().optional().nullable(),
  customFields: z.any().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
  stageId: z.string().uuid().optional().nullable(),
  pipelineId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
  aiPaused: z.boolean().optional(),
}).refine(data => data.firstName || data.first_name, { message: 'firstName ou first_name obrigatorio' })

const updateClientSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().max(255).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  secondaryPhone: z.string().max(50).optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  tags: z.array(z.string()).optional(),
  gender: z.string().max(20).optional().nullable(),
  documentNumber: z.string().max(50).optional().nullable(),
  address: z.any().optional().nullable(),
  customFields: z.any().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable().transform(v => v ?? undefined),
  stageId: z.string().uuid().optional().nullable().transform(v => v ?? undefined),
  pipelineId: z.string().uuid().optional().nullable().transform(v => v ?? undefined),
  isActive: z.boolean().optional(),
  aiPaused: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId, isSuperAdmin } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    // ?summary=true: resposta rapida so com a contagem total (sem o array).
    // Util pra widgets/dashboards que so querem o numero.
    if (req.nextUrl.searchParams.get('summary') === 'true') {
      const total = await prisma.client.count({ where: { companyId } })
      return NextResponse.json({ total }, { headers: { 'X-Total-Count': String(total) } })
    }

    // Paginacao opcional via ?page=&limit=. Default mantem o comportamento
    // historico (1000 primeiros) pra nao quebrar consumidores que esperavam
    // tudo de uma vez. UI mais nova le X-Total-Count pra mostrar o real.
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10))
    const limit = Math.min(5000, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '1000', 10)))
    const skip = (page - 1) * limit

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where: { companyId },
        include: {
          appointments: { select: { id: true, scheduledFor: true, status: true } },
          sales: { select: { id: true, totalAmount: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.client.count({ where: { companyId } }),
    ])

    return NextResponse.json(clients, {
      headers: {
        'X-Total-Count': String(total),
        'X-Page': String(page),
        'X-Limit': String(limit),
      },
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao buscar clientes')
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId: authCompanyId, agentId } = await authenticate(req)
    const body = await req.json()
    const companyId = body.company_id || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const validation = createClientSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { first_name, ...validData } = validation.data
    const client = await prisma.client.create({
      data: {
        companyId,
        firstName: validData.firstName || first_name!,
        lastName: validData.lastName ?? validData.lastName,
        email: validData.email,
        phone: validData.phone,
        secondaryPhone: validData.secondaryPhone,
        source: validData.source,
        tags: validData.tags,
        gender: validData.gender,
        documentNumber: validData.documentNumber,
        address: validData.address ? (validData.address as Prisma.InputJsonValue) : undefined,
        customFields: validData.customFields ? (validData.customFields as Prisma.InputJsonValue) : undefined,
        assignedTo: validData.assignedTo,
        stageId: validData.stageId,
        pipelineId: validData.pipelineId,
        isActive: validData.isActive,
        aiPaused: validData.aiPaused,
      },
    })

    await logAction({
      companyId,
      userId: agentId,
      action: 'CREATE',
      entity: 'client',
      entityId: client.id,
    })

    return NextResponse.json(client, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro ao criar cliente')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId, agentId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const body = await req.json()

    const validation = updateClientSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id, ...data } = validation.data

    const existing = await prisma.client.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const client = await prisma.client.update({
      where: { id },
      data: data as any,
    })

    await logAction({
      companyId,
      userId: agentId,
      action: 'UPDATE',
      entity: 'client',
      entityId: client.id,
    })

    return NextResponse.json(client)
  } catch (error) {
    return handleApiError(error, 'Erro ao atualizar cliente')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId, agentId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const existing = await prisma.client.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    await prisma.client.delete({ where: { id } })

    await logAction({
      companyId,
      userId: agentId,
      action: 'DELETE',
      entity: 'client',
      entityId: id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro ao deletar cliente')
  }
}
