import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId: authCompanyId, agentId } = await authenticate(req)
    const body = await req.json()
    const companyId = body.company_id || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const reminder = await prisma.reminder.create({
      data: {
        companyId,
        conversationId: body.conversation_id,
        clientId: body.client_id,
        createdBy: agentId || body.created_by,
        scheduledFor: new Date(body.scheduled_for),
        messageText: body.message_text,
        status: 'pending',
      },
    })

    return NextResponse.json(reminder)
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

    const reminder = await prisma.reminder.update({
      where: { id },
      data,
    })
    return NextResponse.json(reminder)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
