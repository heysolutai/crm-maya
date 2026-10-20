/**
 * Adapter WhatsApp Cloud (API oficial da Meta via Covercut).
 *
 * Sem QR code: o numero e conectado na Meta (painel Covercut / link SaaS) e
 * aqui so "adotamos" pelo phone_number_id. O provision:
 *   1. confere o numero em GET /numbers/status
 *   2. aponta o webhook do numero pra nossa rota (POST /numbers/webhook) com
 *      echo ligado (resposta pelo celular em coexistencia pausa a IA)
 *   3. guarda o webhook_secret devolvido em instanceApiKey: e com ele que o
 *      receiver valida o X-BSP-Signature
 *
 * instanceName = `cloud-<phone_number_id>`: o receiver resolve a inbox por
 * esse nome (mesmo contrato das outras inboxes).
 */

import type {
  ChannelAdapter,
  ChannelAgent,
  ProvisionInput,
  ProvisionResult,
  QrResult,
  StatusResult,
  SendTextInput,
  SendTextResult,
  SendMediaInput,
} from '../adapter'
import { ChannelError } from '../errors'
import { covercutBaseUrl, covercutRequest, getCovercutNumberStatus } from '../covercut'
import { prepararTextoParaWhatsApp } from '@/lib/whatsapp/texto-whatsapp'

export const CLOUD_INSTANCE_PREFIX = 'cloud-'

export function cloudInstanceName(phoneNumberId: string): string {
  return `${CLOUD_INSTANCE_PREFIX}${phoneNumberId}`
}

function phoneNumberIdOf(agent: ChannelAgent): string {
  const id = agent.channelConfig?.phoneNumberId
  if (typeof id === 'string' && id) return id
  if (agent.instanceName.startsWith(CLOUD_INSTANCE_PREFIX)) return agent.instanceName.slice(CLOUD_INSTANCE_PREFIX.length)
  throw new ChannelError('Numero do WhatsApp Cloud nao configurado nesta inbox', 'BAD_REQUEST')
}

function webhookUrlOf(agent: ChannelAgent): string | null {
  const url = agent.channelConfig?.webhookUrl
  return typeof url === 'string' && url ? url : null
}

function isConnectedStatus(status: string | undefined): boolean {
  const s = (status || '').toUpperCase()
  return s === 'CONNECTED' || s === 'ACTIVE'
}

interface WebhookConfigResponse {
  webhook?: { webhook_secret?: string; display_phone_number?: string }
}

async function configureWebhook(phoneNumberId: string, webhookUrl: string, enabled: boolean): Promise<WebhookConfigResponse> {
  return covercutRequest<WebhookConfigResponse & Record<string, unknown>>('POST', '/numbers/webhook', {
    body: {
      from: phoneNumberId,
      webhook_url: webhookUrl,
      enabled,
      ignore_groups: true,
      // Echo: mensagens enviadas pelo numero voltam pro webhook. Precisamos
      // das que saem do CELULAR (coexistencia) pra pausar a IA; as que saem
      // pela API sao ignoradas no receiver.
      echo_enabled: true,
    },
  })
}

interface SendResponse {
  message_id?: string
}

async function sendMessage(body: Record<string, unknown>): Promise<SendTextResult> {
  const res = await covercutRequest<SendResponse & Record<string, unknown>>('POST', '/messages/send', { body })
  return {
    providerMessageId: String(res.message_id || ''),
    status: 'sent',
    raw: res,
  }
}

export const whatsappCloudAdapter: ChannelAdapter = {
  type: 'whatsapp_cloud',

  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    const raw = input.extra?.phoneNumberId
    const phoneNumberId = typeof raw === 'string' ? raw.replace(/\D/g, '') : ''
    if (!phoneNumberId) {
      throw new ChannelError('Informe o Phone Number ID do numero', 'BAD_REQUEST')
    }

    const status = await getCovercutNumberStatus(phoneNumberId)
    const webhook = await configureWebhook(phoneNumberId, input.webhookUrl, true)
    const secret = webhook.webhook?.webhook_secret
    if (!secret) {
      throw new ChannelError('WhatsApp Cloud nao devolveu o segredo do webhook', 'UNKNOWN')
    }

    const displayPhone = status.display_phone_number || webhook.webhook?.display_phone_number || null

    return {
      providerInstanceName: cloudInstanceName(phoneNumberId),
      instanceApiKey: secret,
      apiUrl: covercutBaseUrl(),
      channelConfig: {
        phoneNumberId,
        displayPhoneNumber: displayPhone,
        webhookUrl: input.webhookUrl,
      },
      metadata: {
        provider: 'covercut',
        status: status.status ?? null,
        quality_rating: status.quality_rating ?? null,
        name_status: status.name_status ?? null,
        connected_at: status.connected_at ?? null,
      },
      status: isConnectedStatus(status.status) ? 'connected' : 'disconnected',
      phoneNumber: displayPhone ? displayPhone.replace(/\D/g, '') : null,
    }
  },

  async getQrCode(agent: ChannelAgent): Promise<QrResult> {
    // Sem QR. "Reconectar" = religar o webhook (caso tenha sido desligado).
    const phoneNumberId = phoneNumberIdOf(agent)
    const webhookUrl = webhookUrlOf(agent)
    if (webhookUrl) await configureWebhook(phoneNumberId, webhookUrl, true)
    const status = await whatsappCloudAdapter.getStatus(agent)
    return { qrCode: null, status: status.status }
  },

  async getStatus(agent: ChannelAgent): Promise<StatusResult> {
    const status = await getCovercutNumberStatus(phoneNumberIdOf(agent))
    return {
      status: isConnectedStatus(status.status) ? 'connected' : 'disconnected',
      phoneNumber: status.display_phone_number ? status.display_phone_number.replace(/\D/g, '') : null,
      raw: { ...status },
    }
  },

  async disconnect(agent: ChannelAgent): Promise<void> {
    // O numero continua conectado na Meta; so paramos de receber eventos.
    const webhookUrl = webhookUrlOf(agent)
    if (!webhookUrl) return
    await configureWebhook(phoneNumberIdOf(agent), webhookUrl, false)
  },

  async remove(agent: ChannelAgent): Promise<void> {
    // Remove o webhook do numero (volta pro fallback da conta). Nunca
    // desconecta o numero da Meta: isso e decisao do restaurante.
    try {
      await covercutRequest('POST', '/numbers/webhook', {
        body: { from: phoneNumberIdOf(agent), action: 'delete' },
      })
    } catch (err) {
      console.warn('[whatsapp-cloud] remover webhook falhou (segue removendo a inbox):', (err as Error)?.message)
    }
  },

  async sendText(agent: ChannelAgent, input: SendTextInput): Promise<SendTextResult> {
    const body: Record<string, unknown> = {
      from: phoneNumberIdOf(agent),
      to: input.to.replace(/\D/g, ''),
      type: 'text',
      text: {
        body: prepararTextoParaWhatsApp(input.text),
        preview_url: Boolean(input.linkPreview),
      },
    }
    if (input.quotedMessageId) body.context = { message_id: input.quotedMessageId }
    return sendMessage(body)
  },

  async sendMedia(agent: ChannelAgent, input: SendMediaInput): Promise<SendTextResult> {
    // Sticker vai como imagem: a Cloud API so aceita sticker webp especifico.
    const type = input.type === 'sticker' ? 'image' : input.type
    const media: Record<string, unknown> = { link: input.url }
    if (input.caption && type !== 'audio') media.caption = input.caption
    if (type === 'document') media.filename = input.fileName || 'arquivo'

    const body: Record<string, unknown> = {
      from: phoneNumberIdOf(agent),
      to: input.to.replace(/\D/g, ''),
      type,
      [type]: media,
    }
    if (input.quotedMessageId) body.context = { message_id: input.quotedMessageId }
    return sendMessage(body)
  },
}

/**
 * Secret ATUAL do webhook do numero. Regrava a mesma URL (idempotente: a
 * Covercut preserva o secret e sempre devolve o valor vigente na resposta).
 */
export async function fetchCloudWebhookSecret(phoneNumberId: string, webhookUrl: string): Promise<string | null> {
  const res = await configureWebhook(phoneNumberId, webhookUrl, true)
  return res.webhook?.webhook_secret ?? null
}

/** Marca como lida + mostra "digitando..." (some no envio ou em 25s). */
export async function sendCloudTyping(phoneNumberId: string, messageId: string): Promise<void> {
  await covercutRequest('POST', '/messages/typing', {
    body: { from: phoneNumberId, message_id: messageId },
  })
}
