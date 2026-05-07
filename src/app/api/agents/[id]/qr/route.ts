import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { getAdapter, hasAdapter } from '@/lib/channels/registry'
import { isChannelType } from '@/lib/channels/types'
import { respondToChannelError, clearAgentError } from '@/lib/channels/api-helpers'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const agent = await prisma.whatsappInstance.findFirst({ where: { id, companyId } })
    if (!agent) return NextResponse.json({ error: 'Agente nao encontrado' }, { status: 404 })

    if (!isChannelType(agent.channelType) || !hasAdapter(agent.channelType as any)) {
      return NextResponse.json({ error: 'Canal sem adapter', code: 'NO_ADAPTER' }, { status: 400 })
    }

    const adapter = getAdapter(agent.channelType as any)
    const result = await adapter.getQrCode({
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

    await prisma.whatsappInstance.update({
      where: { id: agent.id },
      data: {
        qrCode: result.qrCode,
        status: result.status,
      },
    })
    await clearAgentError(agent.id)

    return NextResponse.json({
      qr_code: result.qrCode,
      pairing_code: result.pairingCode || null,
      status: result.status,
    })
  } catch (error) {
    return respondToChannelError(error, {
      agentId: id,
      contextLog: 'agents:qr',
      fallbackMessage: 'Erro ao gerar QR',
    })
  }
}
