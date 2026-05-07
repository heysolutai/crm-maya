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
      return NextResponse.json({ status: agent.status, phone_number: agent.phoneNumber })
    }

    const adapter = getAdapter(agent.channelType as any)
    const result = await adapter.getStatus({
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

    const newStatus = result.status
    const updates: any = { status: newStatus }
    if (newStatus === 'connected') updates.lastConnectedAt = new Date()
    if (result.phoneNumber) updates.phoneNumber = result.phoneNumber

    await prisma.whatsappInstance.update({ where: { id: agent.id }, data: updates })
    if (newStatus === 'connected' || newStatus === 'connecting') {
      await clearAgentError(agent.id)
    }

    return NextResponse.json({
      status: newStatus,
      phone_number: result.phoneNumber || agent.phoneNumber,
    })
  } catch (error) {
    return respondToChannelError(error, {
      agentId: id,
      contextLog: 'agents:status',
      fallbackMessage: 'Erro ao consultar status',
    })
  }
}
