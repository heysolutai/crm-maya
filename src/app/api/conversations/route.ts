import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { logAction } from '@/lib/services/audit'
import { phoneVariants, canonicalPhone } from '@/lib/api/utils'
import { z } from 'zod'

const createConversationSchema = z.object({
  companyId: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  phone: z.string().min(1),
  channel: z.string().optional(),
})

const conversationStatusEnum = z.enum(['active', 'waiting', 'closed', 'transferred'])

const updateConversationSchema = z.object({
  id: z.string().uuid(),
  status: conversationStatusEnum.optional(),
  transferredTo: z.string().uuid().optional().nullable(),
  summary: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  stage: z.string().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  aiHandled: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId, agentId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const status = req.nextUrl.searchParams.get('status')
    const aiHandled = req.nextUrl.searchParams.get('aiHandled')
    const startDate = req.nextUrl.searchParams.get('startDate')
    const endDate = req.nextUrl.searchParams.get('endDate')
    const assignedTo = req.nextUrl.searchParams.get('assignedTo')
    const departmentId = req.nextUrl.searchParams.get('departmentId')

    const where: any = { companyId }
    if (status) where.status = status
    if (aiHandled !== null && aiHandled !== undefined && aiHandled !== '') where.aiHandled = aiHandled === 'true'
    if (startDate) where.startedAt = { ...where.startedAt, gte: new Date(startDate) }
    if (endDate) where.startedAt = { ...where.startedAt, lte: new Date(endDate) }
    if (assignedTo) where.transferredTo = assignedTo
    if (departmentId) where.departmentId = departmentId

    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100')
    const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0')

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, phone: true, email: true, avatarUrl: true, aiPaused: true },
        },
        transferAgent: { select: { fullName: true } },
        department: { select: { id: true, name: true, color: true } },
        messages: {
          select: { messageText: true, messageType: true, senderType: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { startedAt: 'desc' }],
      take: limit,
      skip: offset,
    })

    return NextResponse.json(conversations)
  } catch (error) {
    console.error('Erro ao buscar conversas:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId: authCompanyId, agentId } = await authenticate(req)
    const body = await req.json()

    const validation = createConversationSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const data = validation.data
    const companyId = data.companyId || data.company_id || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const rawPhone = (data.phone || '').replace(/[^0-9]/g, '')
    if (rawPhone.length < 10) {
      return NextResponse.json({ error: 'Número de telefone inválido' }, { status: 400 })
    }

    const variants = phoneVariants(rawPhone)
    const canonical = canonicalPhone(rawPhone)

    // Check if client exists — matching em todas as variações (com/sem 9)
    let client = await prisma.client.findFirst({
      where: {
        companyId,
        OR: [
          { phone: { in: variants } },
          { whatsappLid: { in: variants } },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })

    // Create client if not found (usa forma canônica)
    if (!client) {
      client = await prisma.client.create({
        data: {
          companyId,
          phone: canonical,
          firstName: canonical,
          source: 'manual',
        },
        select: { id: true },
      })
    }

    // Check for existing active conversation
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        clientId: client.id,
        companyId,
        status: { in: ['active', 'waiting'] },
      },
      select: { id: true },
    })

    if (existingConversation) {
      return NextResponse.json({ id: existingConversation.id, existing: true })
    }

    // Create new conversation
    const conversation = await prisma.conversation.create({
      data: {
        clientId: client.id,
        companyId,
        status: 'active',
        channel: (data.channel || 'whatsapp') as any,
        startedAt: new Date(),
      },
      select: { id: true },
    })

    await logAction({
      companyId,
      userId: agentId,
      action: 'CREATE',
      entity: 'conversation',
      entityId: conversation.id,
    })

    return NextResponse.json({ id: conversation.id, existing: false }, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar conversa:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId, agentId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const body = await req.json()

    const validation = updateConversationSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id, ...updates } = validation.data

    const existing = await prisma.conversation.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const conversation = await prisma.conversation.update({
      where: { id },
      data: updates,
    })

    await logAction({
      companyId,
      userId: agentId,
      action: 'UPDATE',
      entity: 'conversation',
      entityId: conversation.id,
    })

    return NextResponse.json(conversation)
  } catch (error) {
    console.error('Erro ao atualizar conversa:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
