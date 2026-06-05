import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { findOrCreateConversation } from '@/lib/api/database'
import { publishEvent } from '@/lib/realtime'
import { enqueueN8NWebhook } from '@/lib/queue'
import { getSystemSetting } from '@/lib/system-settings'

/**
 * Webhook receiver para Evolution API.
 *
 * URL gravada no provider durante provision: /api/webhooks/evolution?agentId={id}
 *
 * Eventos tratados:
 *  - CONNECTION_UPDATE   → atualiza status do agente
 *  - QRCODE_UPDATED      → atualiza qr_code do agente
 *  - MESSAGES_UPSERT     → cria conversa + mensagem (com whatsappInstanceId)
 *  - SEND_MESSAGE        → confirma envio (so loga; o id ja foi gravado pela rota /api/whatsapp/send-text)
 */

interface EvoKey {
  remoteJid?: string
  fromMe?: boolean
  id?: string
  participant?: string
}

interface EvoMessage {
  conversation?: string
  extendedTextMessage?: { text?: string }
  imageMessage?: { caption?: string; url?: string; mimetype?: string }
  videoMessage?: { caption?: string; url?: string; mimetype?: string }
  audioMessage?: { url?: string; mimetype?: string; ptt?: boolean }
  documentMessage?: { url?: string; mimetype?: string; fileName?: string }
  stickerMessage?: { url?: string; mimetype?: string }
  locationMessage?: { degreesLatitude?: number; degreesLongitude?: number }
  contactMessage?: unknown
}

function extractText(msg?: EvoMessage): string {
  if (!msg) return ''
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.fileName ||
    ''
  )
}

function detectType(msg?: EvoMessage, messageType?: string): string {
  if (msg?.imageMessage) return 'image'
  if (msg?.videoMessage) return 'video'
  if (msg?.audioMessage) return msg.audioMessage.ptt ? 'ptt' : 'audio'
  if (msg?.documentMessage) return 'document'
  if (msg?.stickerMessage) return 'sticker'
  if (msg?.locationMessage) return 'location'
  if (msg?.contactMessage) return 'contact'
  if (messageType === 'extendedTextMessage' || messageType === 'conversation') return 'text'
  return 'text'
}

function extractMediaUrl(msg?: EvoMessage): string | null {
  if (!msg) return null
  return (
    msg.imageMessage?.url ||
    msg.videoMessage?.url ||
    msg.audioMessage?.url ||
    msg.documentMessage?.url ||
    msg.stickerMessage?.url ||
    null
  )
}

function jidToPhone(jid: string | undefined): string | null {
  if (!jid) return null
  // Ignora grupos (terminam em @g.us)
  if (jid.endsWith('@g.us')) return null
  const phone = jid.replace(/@.*$/, '').replace(/\D/g, '')
  return phone.length >= 10 ? phone : null
}

/**
 * Converte o status do Baileys/Evolution pro nosso readStatus.
 * Baileys usa enum: ERROR=0, PENDING=1, SERVER_ACK=2, DELIVERY_ACK=3, READ=4, PLAYED=5
 * Evolution geralmente manda como string ('READ', 'DELIVERY_ACK', ...) ou number.
 * Retorna null pra status irrelevante ou desconhecido (nao atualiza o banco).
 */
function mapMessageStatus(raw: unknown): 'sent' | 'delivered' | 'read' | null {
  if (raw === null || raw === undefined) return null

  const s =
    typeof raw === 'number'
      ? String(raw)
      : typeof raw === 'string'
        ? raw.toUpperCase()
        : ''

  switch (s) {
    case 'READ':
    case '4':
    case 'PLAYED':
    case '5':
      return 'read'
    case 'DELIVERY_ACK':
    case '3':
      return 'delivered'
    case 'SERVER_ACK':
    case '2':
    case 'PENDING':
    case '1':
      return 'sent'
    case 'ERROR':
    case '0':
    default:
      return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const agentId = req.nextUrl.searchParams.get('agentId')
    if (!agentId) {
      console.warn('[webhook:evolution] agentId ausente na query')
      return NextResponse.json({ error: 'Missing agentId' }, { status: 400 })
    }

    const payload = await req.json().catch(() => null)
    if (!payload) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const event: string = payload.event || payload.type || ''
    const data = payload.data || {}

    const agent = await prisma.whatsappInstance.findUnique({ where: { id: agentId } })
    if (!agent) {
      console.warn(`[webhook:evolution] agente ${agentId} nao encontrado`)
      return NextResponse.json({ ok: true })
    }

    switch (event) {
      case 'CONNECTION_UPDATE': {
        const state = data.state ?? data.status ?? null
        const updates: any = {}

        if (state === 'open') {
          updates.status = 'connected'
          updates.qrCode = null
          updates.lastConnectedAt = new Date()
          updates.errorMessage = null
        } else if (state === 'close' || state === 'closed' || state === 'logout') {
          updates.status = 'disconnected'
          updates.qrCode = null
        } else if (state === 'connecting') {
          updates.status = 'connecting'
        }

        const jid: string | undefined =
          data.wuid || data.user?.id || data.instance?.user?.id || data.profile?.id
        const phone = jidToPhone(jid)
        if (phone) updates.phoneNumber = phone

        if (Object.keys(updates).length > 0) {
          await prisma.whatsappInstance.update({ where: { id: agentId }, data: updates })
        }
        break
      }

      case 'QRCODE_UPDATED': {
        const code: string | undefined = data?.qrcode?.base64 || data?.qrcode?.code
        if (code) {
          const qrCode = code.startsWith('data:image') ? code : `data:image/png;base64,${code}`
          await prisma.whatsappInstance.update({
            where: { id: agentId },
            data: { qrCode, status: 'connecting' },
          })
        }
        break
      }

      case 'MESSAGES_UPSERT': {
        const key: EvoKey = data?.key || {}
        const fromMe = !!key.fromMe
        const phone = jidToPhone(key.remoteJid)

        if (!phone) {
          // Mensagem de grupo ou JID invalido — ignora por enquanto
          break
        }

        const text = extractText(data?.message as EvoMessage)
        const messageType = detectType(data?.message as EvoMessage, data?.messageType)
        const mediaUrl = extractMediaUrl(data?.message as EvoMessage)
        const providerMessageId: string = key.id || ''
        const pushName: string | undefined = data?.pushName

        // Cria/encontra conversa vinculada a este agente
        const conversationId = await findOrCreateConversation(phone, agent.companyId, agent.id)

        // Atualiza nome do cliente se ainda for o telefone (placeholder)
        if (pushName && !fromMe) {
          await prisma.client.updateMany({
            where: {
              companyId: agent.companyId,
              phone,
              firstName: phone,
            },
            data: { firstName: pushName },
          }).catch(() => {})
        }

        // Dedup: se ja gravamos esta mensagem (uaz_message_id reaproveitado),
        // nao cria duplicada
        if (providerMessageId) {
          const existing = await prisma.message.findFirst({
            where: { uazMessageId: providerMessageId },
            select: { id: true },
          })
          if (existing) {
            return NextResponse.json({ ok: true, deduped: true })
          }
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
              channel: 'evolution_baileys',
              instance_name: agent.instanceName,
              raw_event: event,
              push_name: pushName || null,
            } as any,
          },
        })

        // Touch conversation pra subir na lista
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        })

        // Realtime push pra UI
        await publishEvent(agent.companyId, {
          type: 'conversation:update',
          conversationId,
        }).catch((e) => console.error('[webhook:evolution] publish failed', e))

        // Roteamento pra IA: se o agente tem n8nWebhookUrl configurado e a
        // mensagem veio do cliente (nao eco do proprio agente), enfileira
        // pro N8N processar.
        if (!fromMe) {
          // Checa se a IA esta pausada pra esse cliente (flag aiPaused na tabela
          // clients). Resolve por telefone + companyId. Se paused, pula N8N
          // independente do flag ai_status que o N8N pode ou nao verificar.
          const client = await prisma.client.findFirst({
            where: { companyId: agent.companyId, phone },
            select: { id: true, aiPaused: true },
          })
          if (client?.aiPaused) {
            console.log(`[webhook:evolution] ⛔ IA pausada — mensagem ${message.id} NAO sera enviada pro N8N (client.aiPaused=true)`)
            break
          }

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
            // Contrato unificado entre canais — N8N pode ler mesmos campos
            // independente do canal (uazapi/evolution_baileys/etc).
            const n8nPayload = {
              type: 'incoming',
              channel: 'evolution_baileys',
              // Agente do canal WhatsApp (instancia que recebeu a mensagem)
              whatsapp_agent_id: agent.id,
              whatsapp_agent_name: agent.displayName,
              whatsapp_instance_name: agent.instanceName,
              whatsapp_channel_type: agent.channelType,
              whatsapp_agent_phone: agent.phoneNumber,
              // Atendente humano — null aqui (Evolution nao tem fluxo de transferencia
              // resolvido aqui ainda). Usar conversa para fonte de verdade se precisar.
              agent_id: null,
              nome_agente: null,
              company_id: agent.companyId,
              conversation_id: conversationId,
              message_id: message.id,
              client_id: null, // Evolution webhook ainda nao popula clientId aqui
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
            }).catch((e) => console.error('[webhook:evolution] enqueue N8N failed', e))
          }
        }

        break
      }

      case 'MESSAGES_UPDATE': {
        // Atualizacao de status (entregue / lido / falha) ou edicao do conteudo.
        // Baileys / Evolution mandam diferentes formas — aceitamos varios formatos:
        //   - data.status: "DELIVERY_ACK" | "READ" | "PLAYED" | "PENDING" | ...
        //   - data.update?: { status: ... }   (alguns providers aninham)
        //   - data.key.id: id da mensagem no provider
        const key = data?.key || {}
        const providerMessageId: string | null = key.id || data?.messageId || null
        const rawStatus =
          data?.status ?? data?.update?.status ?? data?.message?.status ?? null

        if (!providerMessageId) break

        const readStatus = mapMessageStatus(rawStatus)
        if (!readStatus) break

        // Match exato OU sufixo (Baileys as vezes prefixa "owner:stanzaID")
        const updateData: any = { readStatus }
        if (readStatus === 'read') updateData.readAt = new Date()

        let result = await prisma.message.updateMany({
          where: { uazMessageId: providerMessageId },
          data: updateData,
        })

        if (result.count === 0) {
          result = await prisma.message.updateMany({
            where: { uazMessageId: { endsWith: `:${providerMessageId}` } },
            data: updateData,
          })
        }

        if (result.count > 0) {
          // Acha as mensagens afetadas pra publicar realtime
          const updated = await prisma.message.findMany({
            where: {
              OR: [
                { uazMessageId: providerMessageId },
                { uazMessageId: { endsWith: `:${providerMessageId}` } },
              ],
            },
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

      case 'MESSAGES_DELETE': {
        // Mensagem revogada/apagada no WhatsApp. Aceitamos:
        //   - data.key.id          (revoke individual)
        //   - data.id              (alguns formatos)
        //   - data.messages: [...] (delete em lote)
        const ids: string[] = []
        if (data?.key?.id) ids.push(data.key.id)
        if (typeof data?.id === 'string') ids.push(data.id)
        if (Array.isArray(data?.messages)) {
          for (const m of data.messages) {
            if (m?.key?.id) ids.push(m.key.id)
          }
        }
        if (ids.length === 0) break

        const found = await prisma.message.findMany({
          where: {
            OR: [
              { uazMessageId: { in: ids } },
              ...ids.map((id) => ({ uazMessageId: { endsWith: `:${id}` } as any })),
            ],
          },
          select: { id: true, conversationId: true, metadata: true },
        })

        await Promise.all(
          found.map((m) =>
            prisma.message.update({
              where: { id: m.id },
              data: {
                metadata: {
                  ...((m.metadata as Record<string, unknown>) || {}),
                  deleted: true,
                  deleted_at: new Date().toISOString(),
                  deleted_by: 'remote',
                } as any,
              },
            })
          )
        )

        await Promise.all(
          found.map((m) =>
            publishEvent(agent.companyId, {
              type: 'message:update',
              conversationId: m.conversationId,
              messageId: m.id,
              patch: { deleted: true, deleted_at: new Date().toISOString() },
            }).catch(() => {})
          )
        )
        break
      }

      case 'SEND_MESSAGE':
      default:
        break
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[webhook:evolution]', error)
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, channel: 'evolution_baileys' })
}
