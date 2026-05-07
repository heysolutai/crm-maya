import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { CHANNEL_TYPES, isChannelType, CHANNEL_REGISTRY } from '@/lib/channels/types'
import { getAdapter, hasAdapter } from '@/lib/channels/registry'
import { z } from 'zod'

const createAgentSchema = z.object({
  channelType: z.enum(CHANNEL_TYPES),
  displayName: z.string().min(1).max(255),
  serverUrl: z.string().url().optional(),
  serverApiKey: z.string().min(1).optional(),
  phoneNumber: z.string().optional(),
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

function publicWebhookUrl(req: NextRequest, channelType: string, agentId: string): string {
  const envBase = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL
  const base = envBase || `${req.nextUrl.protocol}//${req.nextUrl.host}`
  return `${base.replace(/\/+$/, '')}/api/webhooks/${channelType}?agentId=${agentId}`
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

    const { channelType, displayName, serverUrl, serverApiKey, phoneNumber } = validation.data

    if (!isChannelType(channelType)) {
      return NextResponse.json({ error: 'Canal invalido' }, { status: 400 })
    }

    const channelMeta = CHANNEL_REGISTRY[channelType]
    if (channelMeta.status !== 'available') {
      return NextResponse.json(
        { error: 'Canal ainda nao disponivel', code: 'CHANNEL_UNAVAILABLE' },
        { status: 400 }
      )
    }

    // Canais via adapter (ex: evolution_baileys): chama provision pra criar
    // a instancia no provider externo, depois grava no banco com as credenciais retornadas.
    if (hasAdapter(channelType)) {
      const adapter = getAdapter(channelType)

      // Cria placeholder no banco antes pra ter agent.id pra usar no webhook URL
      const placeholder = await prisma.whatsappInstance.create({
        data: {
          companyId,
          instanceName: `pending-${Date.now()}`,
          displayName,
          channelType,
          apiUrl: serverUrl || null,
          status: 'connecting',
          isActive: true,
        },
      })

      const webhookUrl = publicWebhookUrl(req, channelType, placeholder.id)

      try {
        const result = await adapter.provision({
          companyId,
          displayName,
          serverUrl,
          serverApiKey,
          phoneNumber,
          webhookUrl,
        })

        const agent = await prisma.whatsappInstance.update({
          where: { id: placeholder.id },
          data: {
            instanceName: result.providerInstanceName,
            apiUrl: result.apiUrl,
            instanceApiKey: result.instanceApiKey,
            channelConfig: result.channelConfig as any,
            metadata: result.metadata as any,
            qrCode: result.qrCode || null,
            status: result.qrCode ? 'connecting' : 'disconnected',
            phoneNumber: phoneNumber || null,
          },
        })

        return NextResponse.json(mapAgent(agent), { status: 201 })
      } catch (provisionError: any) {
        // Rollback: remove placeholder se o provider rejeitou
        await prisma.whatsappInstance.delete({ where: { id: placeholder.id } }).catch(() => {})
        console.error('[agents:provision]', provisionError)
        return NextResponse.json(
          { error: provisionError?.message || 'Falha ao provisionar agente' },
          { status: 502 }
        )
      }
    }

    // Canal sem adapter (uazapi legado): cria registro local; conexao
    // segue o fluxo antigo de /api/whatsapp/connect.
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

    // Tenta remover do provider antes de apagar local. Falha silenciosa pra
    // nao travar delete se o provider estiver fora do ar.
    if (isChannelType(existing.channelType) && hasAdapter(existing.channelType as any)) {
      try {
        const adapter = getAdapter(existing.channelType as any)
        await adapter.remove({
          id: existing.id,
          companyId: existing.companyId,
          channelType: existing.channelType as any,
          instanceName: existing.instanceName,
          displayName: existing.displayName,
          phoneNumber: existing.phoneNumber,
          apiUrl: existing.apiUrl,
          instanceApiKey: existing.instanceApiKey,
          channelConfig: existing.channelConfig as any,
          metadata: existing.metadata as any,
        })
      } catch (e) {
        console.error('[agents:remove provider]', e)
      }
    }

    await prisma.whatsappInstance.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro ao deletar agente')
  }
}
