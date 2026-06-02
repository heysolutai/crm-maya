import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { z } from 'zod'

const audienceConfigSchema = z.union([
  z.object({
    source: z.literal('manual'),
    phones: z.array(z.string().min(8)).min(1),
  }),
  z.object({
    source: z.literal('tags'),
    tags: z.array(z.string().min(1)).min(1),
    matchMode: z.enum(['any', 'all']).optional().default('any'),
  }),
  z.object({
    source: z.literal('individual'),
    clientIds: z.array(z.string().uuid()).min(1),
  }),
])

const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  whatsappInstanceId: z.string().uuid(),
  messageType: z.enum(['text', 'image', 'document']).default('text'),
  messageText: z.string().max(4096).optional(),
  mediaUrl: z.string().url().optional(),
  mediaFilename: z.string().max(255).optional(),
  mediaMimeType: z.string().max(127).optional(),
  audience: audienceConfigSchema,
  minDelaySeconds: z.number().int().min(1).max(3600).optional().default(8),
  maxDelaySeconds: z.number().int().min(1).max(3600).optional().default(15),
  dailyLimit: z.number().int().positive().nullable().optional(),
  windowStartHour: z.number().int().min(0).max(23).nullable().optional(),
  windowEndHour: z.number().int().min(0).max(23).nullable().optional(),
  timezone: z.string().max(64).optional().default('America/Sao_Paulo'),
  scheduledFor: z.string().datetime().optional(),
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

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const where: any = { companyId: auth.companyId }
    if (status) where.status = status

    const [data, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        include: {
          whatsappInstance: {
            select: { id: true, displayName: true, phoneNumber: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.campaign.count({ where }),
    ])

    return NextResponse.json({
      data: data.map(mapCampaign),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('Erro ao buscar campanhas:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const validation = createCampaignSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const data = validation.data

    if (data.maxDelaySeconds < data.minDelaySeconds) {
      return NextResponse.json(
        { error: 'maxDelaySeconds deve ser maior ou igual a minDelaySeconds' },
        { status: 400 }
      )
    }

    if (data.messageType === 'text' && !data.messageText?.trim()) {
      return NextResponse.json(
        { error: 'Mensagem de texto vazia' },
        { status: 400 }
      )
    }
    if ((data.messageType === 'image' || data.messageType === 'document') && !data.mediaUrl) {
      return NextResponse.json(
        { error: 'mediaUrl obrigatorio pra image/document' },
        { status: 400 }
      )
    }

    // Validar ownership do agente (IDOR prevention)
    const agent = await prisma.whatsappInstance.findFirst({
      where: { id: data.whatsappInstanceId, companyId: auth.companyId },
      select: { id: true },
    })
    if (!agent) {
      return NextResponse.json({ error: 'Agente invalido' }, { status: 400 })
    }

    const campaign = await prisma.campaign.create({
      data: {
        companyId: auth.companyId,
        createdById: auth.agentId || null,
        whatsappInstanceId: data.whatsappInstanceId,
        name: data.name,
        description: data.description || null,
        messageType: data.messageType,
        messageText: data.messageText || null,
        mediaUrl: data.mediaUrl || null,
        mediaFilename: data.mediaFilename || null,
        mediaMimeType: data.mediaMimeType || null,
        audienceSource: data.audience.source,
        audienceConfig: data.audience as any,
        minDelaySeconds: data.minDelaySeconds,
        maxDelaySeconds: data.maxDelaySeconds,
        dailyLimit: data.dailyLimit ?? null,
        windowStartHour: data.windowStartHour ?? null,
        windowEndHour: data.windowEndHour ?? null,
        timezone: data.timezone,
        scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
        status: 'draft',
      },
      include: {
        whatsappInstance: {
          select: { id: true, displayName: true, phoneNumber: true },
        },
      },
    })

    return NextResponse.json(mapCampaign(campaign), { status: 201 })
  } catch (error) {
    console.error('Erro ao criar campanha:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
