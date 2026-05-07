import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { CHANNEL_TYPES, isChannelType } from '@/lib/channels/types'
import { z } from 'zod'

const createAgentSchema = z.object({
  channelType: z.enum(CHANNEL_TYPES),
  displayName: z.string().min(1).max(255),
})

const updateAgentSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
})

function mapAgent(i: any) {
  return {
    id: i.id,
    company_id: i.companyId,
    channel_type: i.channelType,
    display_name: i.displayName || i.instanceName,
    phone_number: i.phoneNumber,
    instance_name: i.instanceName,
    api_url: i.apiUrl,
    instance_api_key: i.instanceApiKey,
    admin_token: i.adminToken,
    status: i.status,
    is_active: i.isActive,
    qr_code: i.qrCode,
    error_message: i.errorMessage,
    last_connected_at: i.lastConnectedAt,
    metadata: i.metadata,
    channel_config: i.channelConfig,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  }
}

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const agents = await prisma.whatsappInstance.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(agents.map(mapAgent))
  } catch (error) {
    return handleApiError(error, 'Erro ao buscar agentes')
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const body = await req.json()
    const validation = createAgentSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { channelType, displayName } = validation.data

    if (!isChannelType(channelType)) {
      return NextResponse.json({ error: 'Canal invalido' }, { status: 400 })
    }

    // Hoje so UazAPI esta implementado — outros canais retornam erro
    // claro pra UI ate os adapters serem entregues.
    if (channelType !== 'uazapi') {
      return NextResponse.json(
        { error: 'Canal ainda nao disponivel', code: 'CHANNEL_UNAVAILABLE' },
        { status: 400 }
      )
    }

    // Gera instance_name slug a partir do displayName + companyId truncado
    const slug = displayName
      .normalize('NFD')
      .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase()
      .slice(0, 30)
    const instanceName = `${slug}-${companyId.slice(0, 8)}`

    const agent = await prisma.whatsappInstance.create({
      data: {
        companyId,
        instanceName,
        displayName,
        channelType,
        status: 'disconnected',
        isActive: true,
      },
    })

    return NextResponse.json(mapAgent(agent), { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro ao criar agente')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const body = await req.json()
    const validation = updateAgentSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id, ...updates } = validation.data

    const existing = await prisma.whatsappInstance.findFirst({
      where: { id, companyId },
    })
    if (!existing) return NextResponse.json({ error: 'Agente nao encontrado' }, { status: 404 })

    const updated = await prisma.whatsappInstance.update({
      where: { id },
      data: updates,
    })

    return NextResponse.json(mapAgent(updated))
  } catch (error) {
    return handleApiError(error, 'Erro ao atualizar agente')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID obrigatorio' }, { status: 400 })

    const existing = await prisma.whatsappInstance.findFirst({
      where: { id, companyId },
    })
    if (!existing) return NextResponse.json({ error: 'Agente nao encontrado' }, { status: 404 })

    await prisma.whatsappInstance.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro ao deletar agente')
  }
}
