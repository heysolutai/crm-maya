import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { getAdapter, hasAdapter } from '@/lib/channels/registry'
import { isChannelType } from '@/lib/channels/types'
import { instanciaAdotada } from '@/lib/channels/adapters/uazapi'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    const { id } = await params
    const agent = await prisma.inbox.findFirst({ where: { id, companyId } })
    if (!agent) return NextResponse.json({ error: 'Agente nao encontrado' }, { status: 404 })

    // Instancia adotada pelo token (ex.: NicoChat): desconectar aqui deslogaria
    // o numero no sistema de origem tambem.
    if (agent.channelType === 'uazapi' && instanciaAdotada(agent.channelConfig)) {
      return NextResponse.json(
        {
          error:
            'Esta conexao usa uma instancia de outro sistema (token existente). Desconectar aqui desligaria o WhatsApp la tambem. Para parar de receber as conversas, remova a caixa de entrada: a instancia continua intacta no servidor.',
          code: 'ADOPTED_INSTANCE',
        },
        { status: 409 }
      )
    }

    if (isChannelType(agent.channelType) && hasAdapter(agent.channelType as any)) {
      const adapter = getAdapter(agent.channelType as any)
      try {
        await adapter.disconnect({
          id: agent.id,
          companyId: agent.companyId,
          channelType: agent.channelType as any,
          instanceName: agent.instanceName,
          displayName: agent.displayName,
          phoneNumber: agent.phoneNumber,
          apiUrl: agent.apiUrl,
          instanceApiKey: agent.instanceApiKey,
          channelConfig: agent.channelConfig as any,
          metadata: agent.metadata as any,
        })
      } catch (e) {
        console.error('[agents:disconnect]', e)
      }
    }

    await prisma.inbox.update({
      where: { id: agent.id },
      data: { status: 'disconnected', qrCode: null },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro ao desconectar')
  }
}
