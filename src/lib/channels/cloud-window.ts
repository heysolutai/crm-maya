import { prisma } from '@/lib/db'
import { getAdapter } from './registry'
import type { ChannelAgent } from './adapter'

/**
 * Janela de atendimento da API oficial: texto livre so pode ser enviado ate
 * 24h depois da ULTIMA mensagem do cliente. Fora dela a Meta so aceita
 * template aprovado; mandar texto livre da erro (e conta contra a qualidade
 * do numero). Crons (follow-up, lembrete) passam por aqui antes de enviar.
 */
export const CLOUD_WINDOW_MS = 24 * 60 * 60 * 1000

export async function isInsideCloudWindow(conversationId: string | null | undefined): Promise<boolean> {
  if (!conversationId) return false
  const last = await prisma.message.findFirst({
    where: { conversationId, senderType: 'client' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  if (!last) return false
  return Date.now() - last.createdAt.getTime() < CLOUD_WINDOW_MS
}

export type CloudSendResult =
  | { sent: true; providerMessageId: string }
  | { sent: false; reason: string }

/** Envia texto por uma inbox WhatsApp Cloud respeitando a janela de 24h. */
export async function sendCloudTextInWindow(params: {
  inboxId: string
  companyId: string
  conversationId: string | null | undefined
  to: string
  text: string
}): Promise<CloudSendResult> {
  if (!(await isInsideCloudWindow(params.conversationId))) {
    return { sent: false, reason: 'Fora da janela de 24h do WhatsApp Cloud (exige template aprovado)' }
  }

  const inbox = await prisma.inbox.findFirst({
    where: { id: params.inboxId, companyId: params.companyId, channelType: 'whatsapp_cloud' },
    select: {
      id: true, companyId: true, instanceName: true, displayName: true, phoneNumber: true,
      apiUrl: true, instanceApiKey: true, channelConfig: true, metadata: true,
    },
  })
  if (!inbox) return { sent: false, reason: 'Inbox WhatsApp Cloud nao encontrada' }

  const agent: ChannelAgent = {
    ...inbox,
    channelType: 'whatsapp_cloud',
    channelConfig: (inbox.channelConfig ?? null) as Record<string, unknown> | null,
    metadata: (inbox.metadata ?? null) as Record<string, unknown> | null,
  }
  const result = await getAdapter('whatsapp_cloud').sendText(agent, { to: params.to, text: params.text })
  return { sent: true, providerMessageId: result.providerMessageId }
}
