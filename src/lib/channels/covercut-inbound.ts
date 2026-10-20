import { buildCovercutMediaRef } from './covercut'

/**
 * Traducao do envelope da Covercut (WhatsApp Cloud) pro payload no formato
 * UazAPI que o pipeline de /api/webhooks/whatsapp entende. Separado da rota
 * pra poder ser testado (arquivo de rota do Next so exporta handlers).
 */

export type Json = Record<string, unknown>

export function obj(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null
}

export function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'] as const
type MediaType = (typeof MEDIA_TYPES)[number]

const UAZ_MESSAGE_TYPE: Record<MediaType, string> = {
  image: 'ImageMessage',
  video: 'VideoMessage',
  audio: 'AudioMessage',
  document: 'DocumentMessage',
  sticker: 'StickerMessage',
}

/** Texto da mensagem: Covercut manda `text` como string; Meta crua como {body}. */
function extractText(message: Json): string {
  const text = message.text
  if (typeof text === 'string') return text
  const textObj = obj(text)
  if (textObj && typeof textObj.body === 'string') return textObj.body

  // Resposta de botao / lista interativa
  const interactive = obj(message.interactive)
  if (interactive) {
    const reply = obj(interactive.button_reply) || obj(interactive.list_reply) || obj(interactive.nfm_reply)
    const title = reply && (str(reply.title) || str(reply.body))
    if (title) return title
  }
  const button = obj(message.button)
  if (button && typeof button.text === 'string') return button.text

  if (message.type === 'contacts' && Array.isArray(message.contacts)) {
    const nomes = message.contacts
      .map((c) => {
        const contato = obj(c)
        const nome = obj(contato?.name)
        return str(nome?.formatted_name) || str(nome?.first_name)
      })
      .filter(Boolean)
    return `[Contato compartilhado${nomes.length ? `: ${nomes.join(', ')}` : ''}]`
  }

  if (message.type === 'unsupported') {
    return '[Mensagem nao suportada pela API oficial (ex: enquete). Veja no celular.]'
  }
  return ''
}

/**
 * Monta o payload no formato UazAPI que o pipeline de /api/webhooks/whatsapp
 * entende. Retorna null pra tipos que nao viram mensagem (reacao, etc).
 */
export function toPipelinePayload(params: {
  instanceName: string
  phoneNumberId: string
  envelope: Json
  fromMe: boolean
}): Json | null {
  const { instanceName, phoneNumberId, envelope, fromMe } = params
  const message = obj(envelope.message)
  const contact = obj(envelope.contact)
  if (!message) return null

  const wamid = str(message.id)
  const waId = str(contact?.wa_id) || str(message.from)
  if (!wamid || !waId) {
    console.warn('[WA Cloud] mensagem sem id ou wa_id, ignorada. tipo:', message.type)
    return null
  }

  const type = str(message.type) || 'text'
  if (type === 'reaction') return null

  const contactName = str(contact?.name) || str(contact?.username) || ''
  const quoted = str(obj(message.context)?.id)
  let text = extractText(message)

  const uazMessage: Json = {
    id: wamid,
    messageid: wamid,
    fromMe,
    wasSentByApi: false,
    senderName: contactName || undefined,
    ...(fromMe ? {} : { sender_pn: `${waId.replace(/\D/g, '')}@s.whatsapp.net` }),
    ...(quoted ? { quoted } : {}),
  }

  if ((MEDIA_TYPES as readonly string[]).includes(type)) {
    const mediaType = type as MediaType
    // Formato Meta: message.image = { id, mime_type, caption, filename, voice }.
    // Fallback pra formato achatado (message.media_id / message.caption).
    const media = obj(message[mediaType]) || {}
    const mediaId = str(media.id) || str(message.media_id)
    if (!mediaId) {
      console.warn('[WA Cloud] midia sem id. chaves:', Object.keys(message).join(','), '| media:', Object.keys(media).join(','))
      if (!text) return null
    } else {
      const caption = str(media.caption) || str(message.caption)
      if (caption) text = caption
      const isVoice = mediaType === 'audio' && (media.voice === true || message.voice === true)
      uazMessage.type = 'media'
      uazMessage.messageType = isVoice ? 'PttMessage' : UAZ_MESSAGE_TYPE[mediaType]
      uazMessage.content = {
        URL: buildCovercutMediaRef(mediaId, phoneNumberId),
        mimetype: str(media.mime_type) || str(message.mime_type),
        fileName: str(media.filename) || str(message.filename),
        PTT: isVoice,
      }
    }
  } else if (type === 'location') {
    const loc = obj(message.location) || {}
    uazMessage.type = 'location'
    uazMessage.messageType = 'LocationMessage'
    uazMessage.content = {
      latitude: loc.latitude,
      longitude: loc.longitude,
      name: str(loc.name),
      address: str(loc.address),
    }
    if (!text) text = str(loc.name) || str(loc.address) || ''
  } else {
    uazMessage.type = 'text'
  }

  if (text) uazMessage.text = text

  // Anuncio Click-to-WhatsApp (Meta): mesmo formato que o pipeline ja le.
  const referral = obj(message.referral)
  if (referral) uazMessage.referral = referral

  return {
    EventType: 'messages',
    instanceName,
    provider: 'whatsapp_cloud',
    chat: {
      phone: waId.replace(/\D/g, ''),
      name: contactName,
      wa_isGroup: false,
    },
    message: uazMessage,
  }
}

