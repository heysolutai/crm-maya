import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

const createReminderSchema = z.object({
  company_id: z.string().uuid().optional(),
  client_id: z.string().uuid().optional(),
  conversation_id: z.string().uuid().optional(),
  created_by: z.string().uuid().optional(),
  scheduled_for: z.string().datetime({ offset: true }).or(z.string().min(1)),
  message_text: z.string().optional(),
})

const updateReminderSchema = z.object({
  id: z.string().uuid(),
  status: z.string().optional(),
  scheduledFor: z.string().datetime({ offset: true }).or(z.string().min(1)).optional(),
  messageText: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const conversationId = req.nextUrl.searchParams.get('conversationId')
    const pendingOnly = req.nextUrl.searchParams.get('pendingOnly') === 'true'

    const where: any = { companyId }
    if (conversationId) where.conversationId = conversationId
    if (pendingOnly) where.status = 'pending'

    const include: any = {}
    if (pendingOnly) {
      include.client = { select: { firstName: true, phone: true } }
      include.conversation = { select: { id: true } }
    }

    const reminders = await prisma.reminder.findMany({
      where,
      include: Object.keys(include).length > 0 ? include : undefined,
      orderBy: { scheduledFor: 'asc' },
    })

    return NextResponse.json(reminders)
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId: authCompanyId, agentId } = await authenticate(req)
    const body = await req.json()

    const validation = createReminderSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const companyId = validation.data.company_id || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const reminder = await prisma.reminder.create({
      data: {
        companyId,
        conversationId: validation.data.conversation_id,
        clientId: validation.data.client_id,
        createdBy: agentId || validation.data.created_by,
        scheduledFor: new Date(validation.data.scheduled_for),
        messageText: validation.data.message_text,
        status: 'pending',
      },
    })

    return NextResponse.json(reminder, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const body = await req.json()

    const validation = updateReminderSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id, ...data } = validation.data

    const existing = await prisma.reminder.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const reminder = await prisma.reminder.update({
      where: { id },
      data,
    })
    return NextResponse.json(reminder)
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}
