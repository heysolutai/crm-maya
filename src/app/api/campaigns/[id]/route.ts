import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  messageType: z.enum(['text', 'image', 'document']).optional(),
  messageText: z.string().max(4096).optional(),
  mediaUrl: z.string().url().optional(),
  mediaFilename: z.string().max(255).optional(),
  mediaMimeType: z.string().max(127).optional(),
  minDelaySeconds: z.number().int().min(1).max(3600).optional(),
  maxDelaySeconds: z.number().int().min(1).max(3600).optional(),
  dailyLimit: z.number().int().positive().nullable().optional(),
  windowStartHour: z.number().int().min(0).max(23).nullable().optional(),
  windowEndHour: z.number().int().min(0).max(23).nullable().optional(),
  timezone: z.string().max(64).optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
})

function mapCampaign(c: any) {
  return {
    id: c.id,
    company_id: c.companyId,
    created_by_id: c.createdById,
    whatsapp_instance_id: c.whatsappInstanceId,
    whatsapp_instance: c.whatsappInstance
      ? {
          id: c.whatsappInstance.id,
          display_name: c.whatsappInstance.displayName,
          phone_number: c.whatsappInstance.phoneNumber,
        }
      : null,
    name: c.name,
    description: c.description,
    message_type: c.messageType,
    message_text: c.messageText,
    media_url: c.mediaUrl,
    media_filename: c.mediaFilename,
    media_mime_type: c.mediaMimeType,
    audience_source: c.audienceSource,
    audience_config: c.audienceConfig,
    min_delay_seconds: c.minDelaySeconds,
    max_delay_seconds: c.maxDelaySeconds,
    daily_limit: c.dailyLimit,
    window_start_hour: c.windowStartHour,
    window_end_hour: c.windowEndHour,
    timezone: c.timezone,
    status: c.status,
    scheduled_for: c.scheduledFor,
    started_at: c.startedAt,
    completed_at: c.completedAt,
    error_message: c.errorMessage,
    recipients_total: c.recipientsTotal,
    recipients_sent: c.recipientsSent,
    recipients_failed: c.recipientsFailed,
    recipients_skipped: c.recipientsSkipped,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const { id } = await params
    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: auth.companyId },
      include: {
        whatsappInstance: {
          select: { id: true, displayName: true, phoneNumber: true },
        },
      },
    })
    if (!campaign) {
      return NextResponse.json({ error: 'Campanha nao encontrada' }, { status: 404 })
    }
    return NextResponse.json(mapCampaign(campaign))
  } catch (error) {
    console.error('Erro ao buscar campanha:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await req.json()
    const validation = updateSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const existing = await prisma.campaign.findFirst({
      where: { id, companyId: auth.companyId },
      select: { id: true, status: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Campanha nao encontrada' }, { status: 404 })
    }
    // So permite editar drafts e scheduled. Em running/completed/cancelled,
    // bloqueamos pra evitar bagunca no meio do disparo.
    if (!['draft', 'scheduled', 'paused'].includes(existing.status)) {
      return NextResponse.json(
        { error: `Nao da pra editar campanha com status "${existing.status}"` },
        { status: 400 }
      )
    }

    const data = validation.data
    const updates: any = {}
    if (data.name !== undefined) updates.name = data.name
    if (data.description !== undefined) updates.description = data.description
    if (data.messageType !== undefined) updates.messageType = data.messageType
    if (data.messageText !== undefined) updates.messageText = data.messageText
    if (data.mediaUrl !== undefined) updates.mediaUrl = data.mediaUrl
    if (data.mediaFilename !== undefined) updates.mediaFilename = data.mediaFilename
    if (data.mediaMimeType !== undefined) updates.mediaMimeType = data.mediaMimeType
    if (data.minDelaySeconds !== undefined) updates.minDelaySeconds = data.minDelaySeconds
    if (data.maxDelaySeconds !== undefined) updates.maxDelaySeconds = data.maxDelaySeconds
    if (data.dailyLimit !== undefined) updates.dailyLimit = data.dailyLimit
    if (data.windowStartHour !== undefined) updates.windowStartHour = data.windowStartHour
    if (data.windowEndHour !== undefined) updates.windowEndHour = data.windowEndHour
    if (data.timezone !== undefined) updates.timezone = data.timezone
    if (data.scheduledFor !== undefined) {
      updates.scheduledFor = data.scheduledFor ? new Date(data.scheduledFor) : null
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: updates,
      include: {
        whatsappInstance: {
          select: { id: true, displayName: true, phoneNumber: true },
        },
      },
    })

    return NextResponse.json(mapCampaign(updated))
  } catch (error) {
    console.error('Erro ao atualizar campanha:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const { id } = await params
    const existing = await prisma.campaign.findFirst({
      where: { id, companyId: auth.companyId },
      select: { id: true, status: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Campanha nao encontrada' }, { status: 404 })
    }
    // Em running, exige cancelar antes pra evitar ter campanhas zumbis disparando
    if (existing.status === 'running') {
      return NextResponse.json(
        { error: 'Cancele a campanha antes de excluir' },
        { status: 400 }
      )
    }

    await prisma.campaign.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao deletar campanha:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
