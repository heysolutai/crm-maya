import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

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

    const where: any = { companyId }
    if (status) where.status = status
    if (aiHandled !== null && aiHandled !== undefined && aiHandled !== '') where.aiHandled = aiHandled === 'true'
    if (startDate) where.startedAt = { ...where.startedAt, gte: new Date(startDate) }
    if (endDate) where.startedAt = { ...where.startedAt, lte: new Date(endDate) }
    if (assignedTo) where.transferredTo = assignedTo

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
    })

    return NextResponse.json(conversations)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const body = await req.json()
    const companyId = body.companyId || body.company_id || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const cleanPhone = (body.phone || '').replace(/[^0-9]/g, '')
    if (cleanPhone.length < 10) {
      return NextResponse.json({ error: 'Número de telefone inválido' }, { status: 400 })
    }

    // Check if client exists with this phone or whatsapp_lid
    let client = await prisma.client.findFirst({
      where: {
        companyId,
        OR: [
          { phone: cleanPhone },
          { whatsappLid: cleanPhone },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })

    // Create client if not found
    if (!client) {
      client = await prisma.client.create({
        data: {
          companyId,
          phone: cleanPhone,
          firstName: cleanPhone,
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
        channel: body.channel || 'whatsapp',
        startedAt: new Date(),
      },
      select: { id: true },
    })

    return NextResponse.json({ id: conversation.id, existing: false })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const conversation = await prisma.conversation.update({
      where: { id },
      data: updates,
    })
    return NextResponse.json(conversation)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
