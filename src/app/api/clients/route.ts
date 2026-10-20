import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { logAction } from '@/lib/services/audit'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { handleApiError } from '@/lib/api/errors'
import { isAiPausedNow, pauseClientAI, resumeClientAI } from '@/lib/ai/pause'

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

/**
 * IDOR: responsavel, etapa e funil vem do body e precisam ser do restaurante.
 * Devolve a mensagem de erro, ou null se esta tudo certo.
 */
async function validarReferencias(
  companyId: string,
  refs: { assignedTo?: string | null; stageId?: string | null; pipelineId?: string | null },
): Promise<string | null> {
  if (refs.assignedTo) {
    const user = await prisma.user.findFirst({
      where: { id: refs.assignedTo, OR: [{ companyId }, { userRoles: { some: { companyId } } }] },
      select: { id: true },
    })
    if (!user) return 'Responsavel invalido'
  }
  if (refs.stageId) {
    const stage = await prisma.funnelStage.findFirst({ where: { id: refs.stageId, companyId }, select: { id: true } })
    if (!stage) return 'Etapa invalida'
  }
  if (refs.pipelineId) {
    const pipeline = await prisma.pipeline.findFirst({ where: { id: refs.pipelineId, companyId }, select: { id: true } })
    if (!pipeline) return 'Funil invalido'
  }
  return null
}

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    const clients = await prisma.client.findMany({
      where: { companyId },
      include: {
        appointments: { select: { id: true, scheduledFor: true, status: true } },
        sales: { select: { id: true, totalAmount: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    })

    return NextResponse.json(clients)
  } catch (error) {
    return handleApiError(error, 'Erro ao buscar clientes')
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId, agentId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    const body = await req.json()

    const validation = createClientSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { first_name, ...validData } = validation.data

    const refInvalida = await validarReferencias(companyId, validData)
    if (refInvalida) return NextResponse.json({ error: refInvalida }, { status: 400 })

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
        // Ja nasce pausado: sem prazo, registra quando e quem.
        ...(validData.aiPaused ? { aiPausedAt: new Date(), aiPausedBy: agentId ?? 'system' } : {}),
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
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    const body = await req.json()

    const validation = updateClientSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id, aiPaused, ...data } = validation.data

    const existing = await prisma.client.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const refInvalida = await validarReferencias(companyId, data)
    if (refInvalida) return NextResponse.json({ error: refInvalida }, { status: 400 })

    // aiPaused passa pelo servico de pausa (prazo, quem pausou, evento e
    // tempo real) em vez de virar so o booleano. Aqui e o liga/desliga do
    // super admin: pausar = sem prazo, ate alguem retomar (comportamento antigo).
    if (aiPaused !== undefined) {
      const actor = agentId ? 'agent' : 'system'
      // Conversa aberta mais recente: e nela que a tela recebe o tempo real.
      const conversa = await prisma.conversation.findFirst({
        where: { clientId: id, companyId, status: { not: 'closed' } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      })
      if (aiPaused) {
        const jaSemPrazo = isAiPausedNow(existing) && !existing.aiPausedUntil
        if (!jaSemPrazo) {
          await pauseClientAI({
            companyId,
            clientId: id,
            conversationId: conversa?.id ?? null,
            actor,
            userId: agentId,
            minutes: null,
          })
        }
      } else if (existing.aiPaused) {
        await resumeClientAI({
          companyId,
          clientId: id,
          conversationId: conversa?.id ?? null,
          actor,
          userId: agentId,
        })
      }
    }

    const client = await prisma.client.update({
      where: { id },
      data: data as Prisma.ClientUncheckedUpdateInput,
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
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
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
