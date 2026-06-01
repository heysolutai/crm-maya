import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { isChannelType } from '@/lib/channels/types'
import { getAdapter, hasAdapter } from '@/lib/channels/registry'
import { ChannelError } from '@/lib/channels/errors'

/**
 * Recria a instancia no provider (UazAPI/Evolution/etc) mantendo o mesmo
 * registro local. Usado quando token expirou, instancia ficou orfa no provider,
 * ou qualquer outro estado em que o adapter nao consegue mais autenticar.
 *
 * Fluxo:
 *  1. Best-effort: deletar a instancia no provider com o token atual
 *     (silenciosa — se o token ja era invalido, ignora o 401)
 *  2. Resolve credenciais (serverUrl + serverApiKey) — primeiro do channelConfig
 *     atual, fallback pra channelCredential salva pra (empresa, canal)
 *  3. Chama adapter.provision com a mesma webhookUrl (mesmo agentId, mesma rota)
 *  4. Atualiza o agente in-place com instanceName/instanceApiKey novos
 *
 * Importante: mantem o mesmo `id` na tabela, entao TODAS as conversas/mensagens
 * antigas continuam vinculadas a este agente. So o estado "lado do provider"
 * eh recriado do zero.
 */

function publicWebhookUrl(req: NextRequest, channelType: string, agentId: string): string {
  const WEBHOOK_PATH_BY_CHANNEL: Record<string, string> = { uazapi: 'whatsapp' }
  const envBase = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL
  const base = envBase || `${req.nextUrl.protocol}//${req.nextUrl.host}`
  const pathSegment = WEBHOOK_PATH_BY_CHANNEL[channelType] || channelType
  return `${base.replace(/\/+$/, '')}/api/webhooks/${pathSegment}?agentId=${agentId}`
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) {
      return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    }

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ID obrigatorio' }, { status: 400 })

    const agent = await prisma.whatsappInstance.findFirst({
      where: { id, companyId },
    })
    if (!agent) {
      return NextResponse.json({ error: 'Agente nao encontrado' }, { status: 404 })
    }

    if (!isChannelType(agent.channelType) || !hasAdapter(agent.channelType as any)) {
      return NextResponse.json(
        { error: 'Canal nao suporta recriacao automatica' },
        { status: 400 }
      )
    }

    const channelType = agent.channelType as any
    const adapter = getAdapter(channelType)

    // 1. Best-effort: limpar a instancia antiga no provider
    try {
      await adapter.remove({
        id: agent.id,
        companyId: agent.companyId,
        channelType,
        instanceName: agent.instanceName,
        displayName: agent.displayName,
        phoneNumber: agent.phoneNumber,
        apiUrl: agent.apiUrl,
        instanceApiKey: agent.instanceApiKey,
        channelConfig: agent.channelConfig as any,
        metadata: agent.metadata as any,
      })
    } catch (e) {
      // Esperado quando o token ja esta invalido — ignorado, vamos criar de novo
      console.warn('[agents:reprovision] remove falhou (esperado se token invalido):', (e as Error).message)
    }

    // 2. Resolver credenciais (admin) pra criar a instancia nova
    const channelConfig = (agent.channelConfig as Record<string, unknown> | null) || {}
    let serverUrl = (channelConfig.serverUrl as string) || agent.apiUrl || undefined
    let serverApiKey = (channelConfig.serverApiKey as string) || undefined

    if (!serverUrl || !serverApiKey) {
      const saved = await prisma.channelCredential.findUnique({
        where: { companyId_channelType: { companyId, channelType } },
      })
      if (saved) {
        serverUrl = serverUrl || saved.serverUrl
        serverApiKey = serverApiKey || saved.serverApiKey
      }
    }

    if (!serverUrl || !serverApiKey) {
      return NextResponse.json(
        {
          error:
            'Credenciais do provider nao encontradas. Salve novamente o admin token nas configuracoes do canal.',
          code: 'MISSING_CREDENTIALS',
        },
        { status: 400 }
      )
    }

    const webhookUrl = publicWebhookUrl(req, channelType, agent.id)

    // 3. Provisiona nova instancia no provider
    try {
      const result = await adapter.provision({
        companyId,
        displayName: agent.displayName || agent.instanceName,
        serverUrl,
        serverApiKey,
        phoneNumber: agent.phoneNumber || undefined,
        webhookUrl,
      })

      // 4. Atualiza o registro local in-place — id, conversas, mensagens preservados
      const updated = await prisma.whatsappInstance.update({
        where: { id: agent.id },
        data: {
          instanceName: result.providerInstanceName,
          apiUrl: result.apiUrl,
          instanceApiKey: result.instanceApiKey,
          channelConfig: result.channelConfig as any,
          metadata: result.metadata as any,
          qrCode: result.qrCode || null,
          status: result.qrCode ? 'connecting' : 'disconnected',
          errorMessage: null,
          lastConnectedAt: null,
        },
      })

      return NextResponse.json({
        success: true,
        agent: {
          id: updated.id,
          instance_name: updated.instanceName,
          status: updated.status,
          qr_code: updated.qrCode,
        },
        qr_code: updated.qrCode,
      })
    } catch (provisionError: unknown) {
      if (provisionError instanceof ChannelError) {
        console.error(`[agents:reprovision] ${provisionError.code}:`, provisionError.message)
        await prisma.whatsappInstance.update({
          where: { id: agent.id },
          data: {
            status: 'error',
            errorMessage: provisionError.message,
          },
        }).catch(() => {})
        return NextResponse.json(
          { error: provisionError.message, code: provisionError.code },
          { status: provisionError.httpStatus }
        )
      }
      console.error('[agents:reprovision]', provisionError)
      return NextResponse.json(
        { error: (provisionError as Error)?.message || 'Falha ao recriar instancia' },
        { status: 502 }
      )
    }
  } catch (error) {
    return handleApiError(error, 'Erro ao recriar instancia')
  }
}
