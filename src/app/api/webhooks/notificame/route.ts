import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { findOrCreateConversation } from '@/lib/api/database'
import { publishEvent } from '@/lib/realtime'
import { enqueueN8NWebhook } from '@/lib/queue'
import { getSystemSetting } from '@/lib/system-settings'

/**
 * Webhook receiver para NotificaMe Hub.
 *
 * URL gravada nas subscriptions durante provision:
 *   /api/webhooks/notificame?agentId={id}
 *
 * NotificaMe NAO assina o body (sem HMAC). Defesa:
 *  1. agentId vem na query — usado pra resolver o agente alvo
 *  2. subscriptionId do payload e validado contra channelConfig.subscriptionIds
 *
 * Eventos suportados:
 *  - MESSAGE         → cria conversa + mensagem
 *  - MESSAGE_STATUS  → atualiza readStatus
 *
 * Doc do payload (a partir do SDK notificamehubsdk):
 *  MESSAGE        { type, id, timestamp, subscriptionId, channel, direction, message }
 *  MESSAGE_STATUS { type, id, timestamp, subscriptionId, channel, messageId,
 *                   contentIndex, messageStatus }
 */

interface NotificameContent {
  type?: string
  text?: string
  fileUrl?: string
  filename?: string
  mediaType?: string
  caption?: string
  latitude?: number
  longitude?: number
}

interface NotificameMessage {
  id?: string
  from?: string
  to?: string
  direction?: 'IN' | 'OUT' | string
  channel?: string
  contents?: NotificameContent[]
  contact?: { name?: string }
}

interface NotificameChannelConfig {
  channelId?: string
  channel?: string
  senderUserId?: string
  subscriptionIds?: { messages?: string; messageStatus?: string }
}

function extractText(contents?: NotificameContent[]): string {
  if (!contents?.length) return ''
  for (const c of contents) {
    if (c.type === 'text' && c.text) return c.text
    if (c.caption) return c.caption
  }
  return ''
}

function detectType(contents?: NotificameContent[]): string {
  if (!contents?.length) return 'text'
  const first = contents[0]
  switch ((first.type || '').toLowerCase()) {
    case 'image':
      return 'image'
    case 'video':
      return 'video'
    case 'audio':
      return 'audio'
    case 'file':
    case 'document':
      return 'document'
    case 'location':
      return 'location'
    case 'contacts':
    case 'contact':
      return 'contact'
    case 'sticker':
      return 'sticker'
    default:
      return 'text'
  }
}

function extractMediaUrl(contents?: NotificameContent[]): string | null {
  if (!contents?.length) return null
  for (const c of contents) {
    if (c.fileUrl) return c.fileUrl
  }
  return null
}

function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null
  const phone = String(raw).replace(/@.*$/, '').replace(/\D/g, '')
  return phone.length >= 10 ? phone : null
}

function mapMessageStatus(raw: unknown): 'sent' | 'delivered' | 'read' | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).toUpperCase()
  switch (s) {
    case 'READ':
    case 'PLAYED':
      return 'read'
    case 'DELIVERED':
    case 'DELIVERY_ACK':
      return 'delivered'
    case 'SENT':
    case 'PENDING':
    case 'SERVER_ACK':
      return 'sent'
    default:
      return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const agentId = req.nextUrl.searchParams.get('agentId')
    if (!agentId) {
      console.warn('[webhook:notificame] agentId ausente na query')
      return NextResponse.json({ error: 'Missing agentId' }, { status: 400 })
    }

    const payload = await req.json().catch(() => null)
    if (!payload) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const agent = await prisma.whatsappInstance.findUnique({ where: { id: agentId } })
    if (!agent) {
      console.warn(`[webhook:notificame] agente ${agentId} nao encontrado`)
      return NextResponse.json({ ok: true })
    }

    const config = (agent.channelConfig as NotificameChannelConfig | null) || {}
    const knownSubIds = config.subscriptionIds || {}
    const eventSubId: string | undefined = payload.subscriptionId

    // Defesa: se o agente tem subscriptionIds gravados, o subscriptionId do
    // evento DEVE coincidir com um deles. Se nao tem (ja existia 409), aceita
    // — mas loga.
    if (knownSubIds.messages || knownSubIds.messageStatus) {
      const matches =
        eventSubId === knownSubIds.messages || eventSubId === knownSubIds.messageStatus
      if (!matches) {
        console.warn(
          `[webhook:notificame] subscriptionId ${eventSubId} nao bate com agente ${agentId}`
        )
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const eventType: string = payload.type || ''

    switch (eventType) {
      case 'MESSAGE': {
        const msg: NotificameMessage = payload.message || {}
        const direction = (payload.direction || msg.direction || 'IN').toString().toUpperCase()
        const fromMe = direction === 'OUT'
        const phone = normalizePhone(fromMe ? msg.to : msg.from)

        if (!phone) break

        const text = extractText(msg.contents)
        const messageType = detectType(msg.contents)
        const mediaUrl = extractMediaUrl(msg.contents)
        const providerMessageId: string = msg.id || payload.id || ''
        const pushName = msg.contact?.name

        const conversationId = await findOrCreateConversation(phone, agent.companyId, agent.id)

        if (pushName && !fromMe) {
          await prisma.client
            .updateMany({
              where: { companyId: agent.companyId, phone, firstName: phone },
              data: { firstName: pushName },
            })
            .catch(() => {})
        }

        // Dedup
        if (providerMessageId) {
          const existing = await prisma.message.findFirst({
            where: { uazMessageId: providerMessageId },
            select: { id: true },
          })
          if (existing) return NextResponse.json({ ok: true, deduped: true })
        }

        const message = await prisma.message.create({
          data: {
            conversationId,
            senderType: fromMe ? 'agent' : 'client',
            messageText: text || null,
            messageType,
            mediaUrl,
            readStatus: fromMe ? 'sent' : null,
            uazMessageId: providerMessageId || null,
            metadata: {
              channel: 'notificame',
              notificame_channel: msg.channel || config.channel || null,
              instance_name: agent.instanceName,
              raw_event: eventType,
              push_name: pushName || null,
            } as any,
          },
        })

        await prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        })

        await publishEvent(agent.companyId, {
          type: 'conversation:update',
          conversationId,
        }).catch((e) => console.error('[webhook:notificame] publish failed', e))

        // Roteamento pra IA
        if (!fromMe) {
          const aiConfig = await prisma.aiConfiguration.findFirst({
            where: { whatsappInstanceId: agent.id, isActive: true },
            select: {
              n8nWebhookUrl: true,
              knowledge: true,
              memoryKey: true,
              productsKnowledge: true,
            },
          })

          const webhookUrl =
            aiConfig?.n8nWebhookUrl || (await getSystemSetting('n8n_ai_webhook_url'))
          if (webhookUrl) {
            const n8nPayload = {
              type: 'incoming',
              channel: 'notificame',
              whatsapp_agent_id: agent.id,
              whatsapp_agent_name: agent.displayName,
              whatsapp_instance_name: agent.instanceName,
              whatsapp_channel_type: agent.channelType,
              whatsapp_agent_phone: agent.phoneNumber,
              agent_id: null,
              nome_agente: null,
              company_id: agent.companyId,
              conversation_id: conversationId,
              message_id: message.id,
              client_id: null,
              numero_cliente: phone,
              push_name: pushName || null,
              message_text: text || '',
              message_type: messageType,
              media_url: mediaUrl,
              provider_message_id: providerMessageId || null,
              knowledge: aiConfig?.knowledge || null,
              memory_key: aiConfig?.memoryKey || null,
              products_knowledge: aiConfig?.productsKnowledge || null,
              ai_status: 'active',
              fromMe,
              timestamp: new Date().toISOString(),
            }

            await enqueueN8NWebhook({
              webhookUrl,
              payload: n8nPayload,
              companyId: agent.companyId,
              conversationId,
              messageId: message.id,
            }).catch((e) => console.error('[webhook:notificame] enqueue N8N failed', e))
          }
        }
        break
      }

      case 'MESSAGE_STATUS': {
        const providerMessageId: string | undefined = payload.messageId
        const rawStatus = payload.messageStatus
        if (!providerMessageId) break

        const readStatus = mapMessageStatus(rawStatus)
        if (!readStatus) break

        const updateData: any = { readStatus }
        if (readStatus === 'read') updateData.readAt = new Date()

        const result = await prisma.message.updateMany({
          where: { uazMessageId: providerMessageId },
          data: updateData,
        })

        if (result.count > 0) {
          const updated = await prisma.message.findMany({
            where: { uazMessageId: providerMessageId },
            select: { id: true, conversationId: true },
          })
          await Promise.all(
            updated.map((m) =>
              publishEvent(agent.companyId, {
                type: 'message:update',
                conversationId: m.conversationId,
                messageId: m.id,
                patch: {
                  readStatus,
                  ...(readStatus === 'read' ? { readAt: new Date().toISOString() } : {}),
                },
              }).catch(() => {})
            )
          )
        }
        break
      }

      default:
        break
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[webhook:notificame]', error)
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, channel: 'notificame' })
}
