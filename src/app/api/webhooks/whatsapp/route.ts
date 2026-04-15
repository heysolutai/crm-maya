import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { handleCors, jsonResponse, errorResponse, badRequestResponse } from '@/lib/api/cors';
import { phoneVariants, canonicalPhone } from '@/lib/api/utils';
import { enqueueInboundMessage, enqueueN8NWebhook, enqueueTranscription, enqueueMediaProcessing } from '@/lib/queue';
import { uploadToB2, buildB2Key, MIME_TO_EXT, deleteMediaFromUrl } from '@/lib/storage';
import { publishEvent } from '@/lib/realtime';
import { sendPushToCompany } from '@/lib/push';

// Schema de validação para o payload da UAZapi
const UAZapiPayloadSchema = z.object({
  instanceName: z.string().min(1, "instanceName is required"),

  chat: z.object({
    phone: z.string().optional(), // Opcional porque grupos não têm phone
    name: z.string().optional(),
    imagePreview: z.union([z.string().url(), z.literal('')]).optional(),
    wa_isGroup: z.boolean().optional(), // Para identificar grupos
  }),
  message: z.object({
    id: z.string().min(1, "message.id is required"),
    messageid: z.string().min(1, "message.messageid is required"),
    fromMe: z.boolean(),
    wasSentByApi: z.boolean().optional().default(false),

    // Campos do remetente (DENTRO de message)
    sender_pn: z.string().optional(), // "5522999120572@s.whatsapp.net"
    senderName: z.string().optional(), // "Thales Faria"
    sender_lid: z.string().optional(), // "161194937679957@lid"

    text: z.string().optional(),
    // Aceitar content como string OU objeto (para mídia)
    content: z.union([
      z.string(),
      z.object({
        URL: z.string().optional(),
        directPath: z.string().optional(),
        mimetype: z.string().optional(),
        fileSHA256: z.string().optional(),
        fileLength: z.number().optional(),
        height: z.number().optional(),
        width: z.number().optional(),
        seconds: z.number().optional(),
        PTT: z.boolean().optional(),
      }).passthrough()
    ]).optional(),
    // Aceitar 'media' como tipo válido
    type: z.enum([
      'text', 'image', 'video', 'audio', 'ptt', 'document',
      'sticker', 'location', 'contact', 'vcard', 'media'
    ]).optional().default('text'),
    messageType: z.string().optional(), // ImageMessage, AudioMessage, etc.
    mediaUrl: z.union([z.string().url(), z.literal('')]).optional(),
    quoted: z.string().optional(), // ID da mensagem respondida (formato novo)
    quotedMsg: z.object({
      id: z.string(),
      messageid: z.string(),
      text: z.string().optional(),
    }).optional(),
    // Meta CTWA (Click to WhatsApp Ads) referral data
    referral: z.object({
      headline: z.string().optional(),
      body: z.string().optional(),
      source_url: z.string().optional(),
      source_id: z.string().optional(),
      source_type: z.string().optional(),
      media_url: z.string().optional(),
      thumbnail_url: z.string().optional(),
      ctwa_clid: z.string().optional(),
    }).passthrough().optional(),
    contextInfo: z.object({
      externalAdReply: z.object({
        title: z.string().optional(),
        body: z.string().optional(),
        sourceUrl: z.string().optional(),
        mediaUrl: z.string().optional(),
        thumbnailUrl: z.string().optional(),
        sourceId: z.string().optional(),
        sourceType: z.string().optional(),
        ctwaClid: z.string().optional(),
      }).passthrough().optional(),
    }).passthrough().optional(),
  }).passthrough(),
  sender: z.object({
    profilePicUrl: z.union([z.string().url(), z.literal('')]).optional(),
  }).optional(),
});

type UAZapiPayload = z.infer<typeof UAZapiPayloadSchema>;

// Ad tracking data from Meta CTWA
interface AdTrackingData {
  ad_id?: string;
  ad_headline?: string;
  ad_body?: string;
  ad_media_url?: string;
  ad_source_url?: string;
  ad_platform: string;
  ctwa_clid?: string;
}

// Interface interna (após adaptação)
interface InternalMessagePayload {
  instance_name: string;
  type: 'incoming' | 'outgoing';
  phone: string;
  whatsapp_lid?: string;
  sender_name?: string;
  is_lid_phone: boolean;
  real_phone?: string;
  message: string;
  message_type: string;
  channel: string;
  media_url?: string;
  profile_picture_url?: string;
  uaz_message_id: string;
  quoted_message_id?: string;
  was_sent_by_api: boolean;
  ad_tracking?: AdTrackingData;
  metadata: Record<string, any>;
}

/**
 * Valida e adapta payload da UAZapi para formato interno
 */
function validateAndAdaptPayload(rawPayload: unknown): {
  success: true;
  data: InternalMessagePayload
} | {
  success: false;
  error: string
} {
  try {
    // Validar payload com Zod
    const validationResult = UAZapiPayloadSchema.safeParse(rawPayload);

    // Ignorar mensagens de grupo
    if (validationResult.success && validationResult.data.chat.wa_isGroup) {
      console.log('[Receive] Ignorando mensagem de grupo');
      return {
        success: false,
        error: 'Group messages are not supported'
      };
    }

    // Validar que phone existe para conversas não-grupo
    if (validationResult.success && (!validationResult.data.chat.phone || validationResult.data.chat.phone === '')) {
      return {
        success: false,
        error: 'chat.phone is required for non-group conversations'
      };
    }

    if (!validationResult.success) {
      const errors = validationResult.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      console.error('========== [VALIDATION FAILED] ==========');
      console.error('[Zod Errors]', errors);
      console.error('[Failed Payload Keys]', Object.keys(rawPayload || {}));
      console.error('[chat.phone]', (rawPayload as any)?.chat?.phone);
      console.error('[chat.wa_isGroup]', (rawPayload as any)?.chat?.wa_isGroup);
      console.error('[message.sender_pn]', (rawPayload as any)?.message?.sender_pn);
      console.error('========================================');
      return {
        success: false,
        error: `Invalid payload structure: ${errors}`
      };
    }

    const uazPayload = validationResult.data;

    // Detectar tipo real e extrair URL de mídia
    let messageType: string = uazPayload.message.type || 'text';
    let mediaUrl: string | undefined = uazPayload.message.mediaUrl;

    // Detectar messageType de múltiplas fontes (message.messageType OU chat.wa_lastMessageType)
    const rawPayloadAny = rawPayload as any;
    const detectedMessageType = uazPayload.message.messageType
      || rawPayloadAny?.chat?.wa_lastMessageType
      || (uazPayload.message as any).mediaType
      || '';

    console.log('[Type Detection] raw type:', uazPayload.message.type,
                '| message.messageType:', uazPayload.message.messageType,
                '| chat.wa_lastMessageType:', rawPayloadAny?.chat?.wa_lastMessageType,
                '| mediaType:', (uazPayload.message as any).mediaType,
                '| content PTT:', (uazPayload.message.content as any)?.PTT,
                '| resolved:', detectedMessageType);

    // Mapear baseado no messageType detectado
    if (detectedMessageType) {
      const typeMap: Record<string, string> = {
        'ImageMessage': 'image',
        'AudioMessage': 'audio',
        'PttMessage': 'ptt',
        'PTTMessage': 'ptt',
        'VideoMessage': 'video',
        'DocumentMessage': 'document',
        'StickerMessage': 'sticker',
        'LocationMessage': 'location',
      };

      const mappedType = typeMap[detectedMessageType];
      if (mappedType) {
        messageType = mappedType;
        console.log('[Type Detection] Mapped from', detectedMessageType, '→', messageType);
      } else if (messageType === 'media') {
        messageType = 'document';
      }

      // Extrair URL da mídia do objeto content
      if (typeof uazPayload.message.content === 'object' && uazPayload.message.content !== null) {
        mediaUrl = uazPayload.message.content.URL || uazPayload.message.content.directPath || mediaUrl;
      }
    }

    // Detectar PTT pelo campo content.PTT (áudios de voz do WhatsApp)
    if (messageType === 'audio' && typeof uazPayload.message.content === 'object' && (uazPayload.message.content as any)?.PTT === true) {
      messageType = 'ptt';
    }

    // Detectar tipo location também pelo type direto
    if (uazPayload.message.type === 'location' || uazPayload.message.messageType === 'LocationMessage') {
      messageType = 'location';
    }

    // Extrair texto da mensagem (sem fallback de label — estilo WhatsApp: a mídia é o conteúdo)
    const messageText = uazPayload.message.text
      || (typeof uazPayload.message.content === 'string' ? uazPayload.message.content : '')
      || '';

    // Validar que mensagem não está vazia (localização é válida mesmo sem texto)
    if (!messageText && !mediaUrl && messageType !== 'location') {
      return {
        success: false,
        error: 'Message text or media URL is required'
      };
    }

    // Validar tipos de mídia conhecidos
    const supportedMediaTypes = ['image', 'video', 'audio', 'ptt', 'document', 'sticker'];
    if (mediaUrl && !supportedMediaTypes.includes(messageType)) {
      console.warn(`[Validation] Unknown media type: ${messageType}, treating as document`);
      messageType = 'document';
    }

    // Mapear fromMe para type
    const type = uazPayload.message.fromMe ? 'outgoing' : 'incoming';

    // Extrair sender_pn, sender_lid e senderName de dentro de message
    const senderPnJid = uazPayload.message.sender_pn;
    const senderLidJid = uazPayload.message.sender_lid;
    const senderName = uazPayload.message.senderName;
    const chatPhone = uazPayload.chat.phone;
    const chatName = uazPayload.chat.name;

    console.log('[Webhook Debug] fromMe:', uazPayload.message.fromMe,
                'sender_pn:', senderPnJid,
                'sender_lid:', senderLidJid,
                'chat.phone:', chatPhone);

    // 1º: Determinar fonte do telefone baseado em fromMe
    let phoneFromPn: string | undefined;
    let lidNumeric: string | undefined;
    let phone: string;
    let isLid = false;
    let clientName: string | undefined;

    if (uazPayload.message.fromMe) {
      console.log('[Outgoing Message] Using chat.phone as client phone');
      const rawChatPhone = chatPhone;
      if (!rawChatPhone) {
        return {
          success: false,
          error: 'chat.phone is required for outgoing messages'
        };
      }
      phone = rawChatPhone.split('@')[0].replace(/\D/g, '');
      clientName = chatName || undefined;

      console.log('[Phone Final] Outgoing - phone:', phone, 'no LID capture (client identified by phone only)');
    } else {
      console.log('[Incoming Message] Using sender_pn/sender_lid as client phone');

      if (senderPnJid) {
        phoneFromPn = senderPnJid.split('@')[0].replace(/\D/g, '');
        console.log('[Phone Extraction] From sender_pn:', phoneFromPn);
      }

      if (senderLidJid) {
        lidNumeric = senderLidJid.split('@')[0].replace(/\D/g, '');
        console.log('[LID Extraction] From sender_lid:', lidNumeric);
      }

      if (phoneFromPn) {
        phone = phoneFromPn;
        console.log('[Phone Final] Using sender_pn:', phone);
      } else if (lidNumeric) {
        phone = lidNumeric;
        if (phone.length === 14) {
          isLid = true;
          console.log('[LID Detection] Phone is a LID (14 digits):', phone);
        }
        console.log('[Phone Final] Using sender_lid number:', phone, 'isLid:', isLid);
      } else if (chatPhone) {
        phone = chatPhone.split('@')[0].replace(/\D/g, '');
        console.log('[Phone Final] Using chat.phone (fallback):', phone);
      } else {
        return {
          success: false,
          error: 'No valid phone number found in message'
        };
      }

      clientName = senderName || chatName;
    }

    if (phone.length < 10 || phone.length > 15) {
      return {
        success: false,
        error: `Invalid phone number format (length: ${phone.length})`
      };
    }

    const whatsappLid: string | undefined = lidNumeric;

    console.log('[Final Values] phone:', phone,
                'whatsapp_lid:', whatsappLid,
                'sender_name:', clientName,
                'fromMe:', uazPayload.message.fromMe);

    const quotedMessageId = uazPayload.message.quoted ||
                            uazPayload.message.quotedMsg?.messageid;

    if (quotedMessageId) {
      console.log('[Reply Detection] quoted_message_id:', quotedMessageId);
    }

    if (mediaUrl) {
      try {
        new URL(mediaUrl);
      } catch {
        console.warn(`[Validation] Invalid media URL: ${mediaUrl}`);
      }
    }

    // Extract Meta CTWA ad tracking data
    let adTracking: AdTrackingData | undefined;
    const referral = uazPayload.message.referral;
    const extAdReply = uazPayload.message.contextInfo?.externalAdReply;
    // Also check raw payload for non-schema fields
    const rawRef = (rawPayload as any)?.message?.referral;
    const rawCtx = (rawPayload as any)?.message?.contextInfo?.externalAdReply;

    if (referral || extAdReply || rawRef || rawCtx) {
      const ref = referral || rawRef;
      const ext = extAdReply || rawCtx;
      adTracking = {
        ad_id: ref?.source_id || ext?.sourceId,
        ad_headline: ref?.headline || ext?.title,
        ad_body: ref?.body || ext?.body,
        ad_media_url: ref?.media_url || ref?.thumbnail_url || ext?.mediaUrl || ext?.thumbnailUrl,
        ad_source_url: ref?.source_url || ext?.sourceUrl,
        ad_platform: 'meta',
        ctwa_clid: ref?.ctwa_clid || ext?.ctwaClid,
      };
      console.log('[Ad Tracking] CTWA data detected:', JSON.stringify(adTracking));
    }

    return {
      success: true,
      data: {
        instance_name: uazPayload.instanceName,
        type,
        phone,
        whatsapp_lid: whatsappLid,
        sender_name: clientName,
        is_lid_phone: isLid,
        real_phone: phoneFromPn,
        message: messageText,
        message_type: messageType,
        channel: 'whatsapp',
        media_url: mediaUrl,
        profile_picture_url: uazPayload.chat?.imagePreview,
        uaz_message_id: uazPayload.message.messageid,
        quoted_message_id: quotedMessageId,
        was_sent_by_api: uazPayload.message.wasSentByApi || false,
        ad_tracking: adTracking,
        metadata: {
          uaz_full_id: uazPayload.message.id,
          chat_name: uazPayload.chat.name,
          sender_name: senderName,
          sender_pn: senderPnJid,
          sender_lid: senderLidJid,
          validated: true,
          validation_timestamp: new Date().toISOString(),
          ...(messageType === 'location' && typeof uazPayload.message.content === 'object' && uazPayload.message.content !== null ? {
            latitude: (uazPayload.message.content as any).degreesLatitude || (uazPayload.message.content as any).latitude,
            longitude: (uazPayload.message.content as any).degreesLongitude || (uazPayload.message.content as any).longitude,
            address: (uazPayload.message.content as any).address || (uazPayload.message.content as any).name,
            name: (uazPayload.message.content as any).name,
          } : {}),
        },
      }
    };
  } catch (error) {
    console.error('[Validation] Unexpected error during validation:', error);
    return {
      success: false,
      error: 'Erro interno do servidor'
    };
  }
}

/**
 * Download de mídia do UAZapi usando endpoint /message/download
 */
async function downloadMediaFromWhatsApp(
  messageId: string,
  instanceApiKey: string,
  instanceApiUrl: string
): Promise<{ data: string; mimeType: string } | null> {
  try {
    console.log('[Media Download] Requesting media from UAZapi, messageId:', messageId);

    const response = await fetch(`${instanceApiUrl}/message/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': instanceApiKey,
      },
      body: JSON.stringify({
        id: messageId,
        return_base64: true,
        generate_mp3: false,
        return_link: false,
        transcribe: false,
        download_quoted: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Media Download] UAZapi error:', response.status, errorText);
      return null;
    }

    const result = await response.json();

    console.log('[Media Download] UAZapi response:', JSON.stringify(result));
    console.log('[Media Download] Response keys:', Object.keys(result));

    const base64Data = result.base64Data || result.base64 || result.data || result.file || result.content;
    const mimeType = result.mimetype || result.mimeType || result.mime_type || 'application/octet-stream';

    if (!base64Data) {
      console.error('[Media Download] No base64 data found in response');
      console.error('[Media Download] Available fields:', Object.keys(result));
      return null;
    }

    return {
      data: base64Data,
      mimeType: mimeType,
    };
  } catch (error) {
    console.error('[Media Download] Exception:', error);
    return null;
  }
}

/**
 * Upload de mídia para o Backblaze B2 (S3-compatible)
 */
async function uploadMediaToStorage(
  base64Data: string,
  messageType: string,
  companyId: string,
  conversationId: string,
  mimeType: string
): Promise<string | null> {
  try {
    console.log('[Storage Upload] Starting B2 upload, type:', messageType, 'mime:', mimeType);

    const buffer = Buffer.from(base64Data, 'base64');
    const extension = MIME_TO_EXT[mimeType] || mimeType.split('/')[1] || 'bin';
    const key = buildB2Key(messageType, companyId, conversationId, extension);

    const publicUrl = await uploadToB2(buffer, key, mimeType);

    console.log('[Storage Upload] B2 success, url:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('[Storage Upload] B2 Exception:', error);
    return null;
  }
}

/**
 * Transcreve áudio diretamente via OpenAI Whisper API usando base64
 */
async function transcribeAudioWithWhisper(
  base64Data: string,
  mimeType: string,
  openAiKey: string
): Promise<string | null> {
  try {
    console.log('[Whisper] Starting direct transcription, mimeType:', mimeType, 'base64 length:', base64Data.length);

    const buffer = Buffer.from(base64Data, 'base64');
    const bytes = new Uint8Array(buffer);

    const extMap: Record<string, string> = {
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'audio/wav': 'wav',
      'audio/webm': 'webm',
      'audio/x-m4a': 'm4a',
    };
    const ext = extMap[mimeType] || 'ogg';

    const formData = new FormData();
    const blob = new Blob([bytes], { type: mimeType });
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Whisper] API error:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    const transcription = result.text;

    if (transcription && transcription.trim()) {
      console.log('[Whisper] ✅ Transcription success:', transcription.substring(0, 100));
      return transcription.trim();
    } else {
      console.warn('[Whisper] Empty transcription returned');
      return null;
    }
  } catch (error) {
    console.error('[Whisper] Exception:', error);
    return null;
  }
}

/**
 * Transcreve uma mensagem de áudio usando UAZapi + OpenAI (método legado)
 */
async function transcribeAudioViaUazapi(
  uazMessageId: string,
  instanceApiKey: string,
  apiUrl: string,
  openAiKey: string
): Promise<string | null> {
  try {
    console.log('[Transcription UAZapi] Starting for message:', uazMessageId);

    const transcriptionUrl = `${apiUrl}/message/download`;
    const response = await fetch(transcriptionUrl, {
      method: 'POST',
      headers: {
        'token': instanceApiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        id: uazMessageId,
        return_base64: false,
        generate_mp3: false,
        return_link: false,
        transcribe: true,
        openai_apikey: openAiKey,
        download_quoted: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Transcription UAZapi] API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log('[Transcription UAZapi] Response keys:', Object.keys(data));
    const transcription = data.transcription || data.text;

    if (transcription) {
      console.log('[Transcription UAZapi] Success:', transcription.substring(0, 100));
      return transcription;
    } else {
      console.warn('[Transcription UAZapi] No transcription in response, keys:', Object.keys(data));
      return null;
    }
  } catch (error) {
    console.error('[Transcription UAZapi] Exception:', error);
    return null;
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

export async function POST(req: NextRequest) {
  try {
    // Parse e validar payload RAW da UAZapi
    const rawPayload = await req.json();

    // ========== LOGGING DETALHADO INICIAL (ANTES DE VALIDAÇÃO) ==========
    const debugInfo = {
      EventType: rawPayload?.EventType,
      instanceName: rawPayload?.instanceName,
      chatPhone: rawPayload?.chat?.phone,
      chatName: rawPayload?.chat?.name,
      isGroup: rawPayload?.chat?.wa_isGroup,
      messageId: rawPayload?.message?.id,
      messageFromMe: rawPayload?.message?.fromMe,
      messageType: rawPayload?.message?.type,
      messageText: rawPayload?.message?.text?.substring(0, 50) || (typeof rawPayload?.message?.content === 'string' ? rawPayload.message.content.substring(0, 50) : ''),
      senderPn: rawPayload?.message?.sender_pn,
      senderName: rawPayload?.message?.senderName,
      senderLid: rawPayload?.message?.sender_lid,
    };

    console.log('========== [WEBHOOK RECEIVED] ==========');
    console.log('[Event]', debugInfo.EventType);
    console.log('[Instance]', debugInfo.instanceName);
    console.log('[Chat] phone:', debugInfo.chatPhone, '| name:', debugInfo.chatName, '| isGroup:', debugInfo.isGroup);
    console.log('[Message] id:', debugInfo.messageId, '| fromMe:', debugInfo.messageFromMe, '| type:', debugInfo.messageType);
    console.log('[Message] text:', debugInfo.messageText);
    console.log('[Sender] pn:', debugInfo.senderPn, '| name:', debugInfo.senderName, '| lid:', debugInfo.senderLid);
    console.log('========================================');

    console.log('[Receive] Full raw payload:', JSON.stringify(rawPayload, null, 2));

    // ===== FILTRO DE EVENTOS DE SISTEMA (EARLY RETURN) =====
    const systemEvents = ['connection', 'status', 'qrcode', 'presence', 'typing', 'connected', 'disconnected', 'connecting'];
    if (rawPayload.EventType && systemEvents.includes(rawPayload.EventType.toLowerCase())) {
      console.log(`[Receive] Ignoring system event: ${rawPayload.EventType}`);
      return jsonResponse({ status: 'ignored', reason: 'system_event', event_type: rawPayload.EventType });
    }

    // ===== PROCESSAMENTO DE TRANSCRIÇÃO AUTOMÁTICA DA UAZAPI =====
    if (rawPayload.type === 'TranscribedMessage' && rawPayload.state === 'Transcribed' && rawPayload.event?.Text) {
      console.log('[TranscribedMessage] Received transcription from UAZapi');
      console.log('[TranscribedMessage] Text:', rawPayload.event.Text);
      console.log('[TranscribedMessage] MessageIDs:', rawPayload.event.MessageIDs);

      const transcriptionText = rawPayload.event.Text as string;
      const messageIds = (rawPayload.event.MessageIDs || []) as string[];

      if (messageIds.length === 0) {
        console.log('[TranscribedMessage] No MessageIDs found, ignoring');
        return jsonResponse({ status: 'ignored', reason: 'no_message_ids' });
      }

      // Localizar a mensagem original pelo uaz_message_id
      let originalMessage: any = null;

      for (const msgId of messageIds) {
        // Tentar buscar pelo ID exato
        const exactMatch = await prisma.message.findFirst({
          where: { uazMessageId: msgId },
          select: { id: true, conversationId: true, messageText: true, metadata: true, senderType: true },
        });

        if (exactMatch) {
          originalMessage = exactMatch;
          console.log('[TranscribedMessage] Found message by exact match:', msgId);
          break;
        }

        // Tentar buscar por sufixo (formato phone:id)
        const suffixMatches = await prisma.message.findMany({
          where: { uazMessageId: { endsWith: msgId } },
          select: { id: true, conversationId: true, messageText: true, metadata: true, senderType: true },
          take: 1,
        });

        if (suffixMatches && suffixMatches.length > 0) {
          originalMessage = suffixMatches[0];
          console.log('[TranscribedMessage] Found message by suffix match:', msgId);
          break;
        }
      }

      if (!originalMessage) {
        console.log('[TranscribedMessage] Original message not found in DB for IDs:', messageIds);
        return jsonResponse({ status: 'not_found', reason: 'original_message_not_found', message_ids: messageIds });
      }

      // Atualizar a mensagem com a transcrição
      const existingMetadata = (originalMessage.metadata || {}) as Record<string, any>;
      const updatedMetadata = {
        ...existingMetadata,
        transcription: transcriptionText,
        transcription_source: 'uazapi_auto',
        transcribed_at: new Date().toISOString(),
      };

      await prisma.message.update({
        where: { id: originalMessage.id },
        data: {
          messageText: transcriptionText,
          metadata: updatedMetadata,
        },
      });

      console.log('[TranscribedMessage] Message updated with transcription:', originalMessage.id);

      // Reenviar para N8N se a mensagem era incoming (cliente enviou áudio)
      if (originalMessage.senderType === 'client') {
        const convData = await prisma.conversation.findUnique({
          where: { id: originalMessage.conversationId },
          select: { companyId: true, clientId: true, stage: true, friendlyId: true },
        });

        if (convData) {
          const aiConfig = await prisma.aiConfiguration.findFirst({
            where: { companyId: convData.companyId, isActive: true },
            select: { n8nWebhookUrl: true, knowledge: true, memoryKey: true, productsKnowledge: true },
          });

          const n8nUrl = aiConfig?.n8nWebhookUrl || process.env.N8N_AI_WEBHOOK_URL;

          if (n8nUrl) {
            const clientData = convData.clientId ? await prisma.client.findUnique({
              where: { id: convData.clientId },
              select: { firstName: true, lastName: true, phone: true, aiPaused: true },
            }) : null;

            const apiKeyRecord = await prisma.apiKey.findFirst({
              where: { companyId: convData.companyId || '', isActive: true },
              select: { key: true },
            });

            const companyData = await prisma.company.findUnique({
              where: { id: convData.companyId },
              select: { name: true, settings: true },
            });

            const clientName = clientData
              ? `${clientData.firstName} ${clientData.lastName ?? ''}`.trim()
              : 'Cliente';

            const webhookPayload = {
              tipo_mensagem: 'audio_transcription',
              conteudo: transcriptionText,
              nome_cliente: clientName,
              numero_cliente: clientData?.phone ?? '',
              company_id: convData.companyId,
              conversation_id: originalMessage.conversationId,
              conversation_friendly_id: convData.friendlyId || null,
              client_id: convData.clientId,
              fromMe: false,
              stage: convData.stage || null,
              media_url: null,
              company_name: companyData?.name || null,
              ai_status: clientData?.aiPaused ? 'paused' : 'active',
              knowledge: aiConfig?.knowledge || null,
              memory_key: aiConfig?.memoryKey || null,
              products_knowledge: aiConfig?.productsKnowledge || null,
              api_key: apiKeyRecord?.key || null,
              message_id: originalMessage.id,
              is_transcription_update: true,
              timestamp: new Date().toISOString(),
            };

            console.log('[TranscribedMessage] Resending to N8N with transcribed text');

            try {
              const resp = await fetch(n8nUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(webhookPayload),
              });
              console.log('[TranscribedMessage] N8N response:', resp.status);
            } catch (webhookErr) {
              console.error('[TranscribedMessage] N8N webhook failed:', webhookErr);
            }
          } else {
            console.log('[TranscribedMessage] No N8N webhook URL configured');
          }
        }
      }

      return jsonResponse({ status: 'transcription_processed', message_id: originalMessage.id });
    }
    // ===== FIM: PROCESSAMENTO DE TRANSCRIÇÃO AUTOMÁTICA =====

    // Ignorar webhooks sem estrutura de mensagem válida (exceto ReadReceipt que é tratado abaixo)
    if (!rawPayload.chat && !rawPayload.message && rawPayload.type !== 'ReadReceipt') {
      console.log(`[Receive] Ignoring non-message webhook: ${rawPayload.EventType || rawPayload.type || 'unknown'}`);
      return jsonResponse({ status: 'ignored', reason: 'not_a_message', event_type: rawPayload.EventType || rawPayload.type });
    }

    // ===== PROCESSAMENTO DE READ RECEIPTS =====
    if (rawPayload.type === 'ReadReceipt' && rawPayload.event?.MessageIDs) {
      console.log('[ReadReceipt] Processing message status update...');

      const messageIds = rawPayload.event.MessageIDs as string[];
      const state = rawPayload.state;

      let readStatus: 'sent' | 'delivered' | 'read' = 'sent';
      if (state === 'Delivered') {
        readStatus = 'delivered';
      } else if (state === 'Read') {
        readStatus = 'read';
      }

      console.log(`[ReadReceipt] Updating ${messageIds.length} messages to status: ${readStatus}`);
      console.log(`[ReadReceipt] Message IDs from webhook:`, messageIds);

      // Try exact match first
      const updateResult = await prisma.message.updateMany({
        where: { uazMessageId: { in: messageIds } },
        data: {
          readStatus,
          ...(state === 'Read' ? { readAt: new Date() } : {}),
        },
      });

      let updatedCount = updateResult.count;

      // If no exact match found, try suffix match
      if (updatedCount === 0 && messageIds.length > 0) {
        console.log('[ReadReceipt] No exact match found, trying suffix match...');

        for (const msgId of messageIds) {
          const suffixResult = await prisma.message.updateMany({
            where: { uazMessageId: { endsWith: msgId } },
            data: {
              readStatus,
              ...(state === 'Read' ? { readAt: new Date() } : {}),
            },
          });

          if (suffixResult.count > 0) {
            console.log(`[ReadReceipt] Found ${suffixResult.count} messages with suffix match for ${msgId}`);
            updatedCount += suffixResult.count;
          }
        }
      }

      console.log(`[ReadReceipt] Successfully updated ${updatedCount} messages`);

      // Publica eventos realtime para as mensagens afetadas
      if (updatedCount > 0) {
        const updated = await prisma.message.findMany({
          where: {
            OR: [
              { uazMessageId: { in: messageIds } },
              ...messageIds.map((mid) => ({ uazMessageId: { endsWith: mid } })),
            ],
          },
          select: {
            id: true,
            conversationId: true,
            conversation: { select: { companyId: true } },
          },
        });
        await Promise.all(updated.map(m =>
          publishEvent(m.conversation.companyId, {
            type: 'message:update',
            conversationId: m.conversationId,
            messageId: m.id,
            patch: { readStatus, ...(state === 'Read' ? { readAt: new Date().toISOString() } : {}) },
          })
        ));
      }

      return jsonResponse({
        success: true,
        message: 'Message status updated',
        updated_count: updatedCount,
        status: readStatus,
      });
    }
    // ===== FIM: PROCESSAMENTO DE READ RECEIPTS =====

    // ===== PROCESSAMENTO DE DELETE / REVOKE DE MENSAGEM =====
    // UazAPI pode sinalizar revoke de varias formas:
    //   1. rawPayload.type === 'MessageUpdate' com state === 'Revoked'/'Deleted'
    //   2. message.messageType === 'ProtocolMessage' com type REVOKE
    //   3. rawPayload.EventType === 'messages.delete'
    const isDeleteEvent = (() => {
      if (rawPayload.type === 'MessageUpdate' && ['Revoked', 'Deleted', 'revoked', 'deleted'].includes(rawPayload.state)) return true;
      if (['messages.delete', 'message.revoke', 'message.delete'].includes((rawPayload.EventType || '').toLowerCase())) return true;
      const msgType = rawPayload.message?.messageType || rawPayload.message?.type;
      if (msgType === 'ProtocolMessage') {
        const protocolType = rawPayload.message?.content?.type || rawPayload.message?.content?.protocolType;
        if (protocolType === 'REVOKE' || protocolType === 0) return true;
      }
      return false;
    })();

    if (isDeleteEvent) {
      // Coleta IDs da mensagem alvo: pode vir em varios campos
      const targetIds: string[] = [
        ...(rawPayload.event?.MessageIDs || []),
        rawPayload.message?.content?.key?.id,
        rawPayload.message?.content?.stanzaId,
        rawPayload.message?.content?.messageId,
        rawPayload.message?.quoted,
        rawPayload.message?.quotedMsg?.messageid,
      ].filter((v: unknown): v is string => typeof v === 'string' && v.length > 0);

      if (targetIds.length === 0) {
        console.log('[MessageDelete] Evento de delete sem IDs alvo, ignorando');
        return jsonResponse({ status: 'ignored', reason: 'no_target_ids' });
      }

      console.log('[MessageDelete] Deletando mensagens com uazMessageIds:', targetIds);

      // Primeiro busca as mensagens (para pegar companyId/conversationId e publicar o evento)
      const toDelete = await prisma.message.findMany({
        where: {
          OR: [
            { uazMessageId: { in: targetIds } },
            ...targetIds.map((tid) => ({ uazMessageId: { endsWith: tid } })),
          ],
        },
        select: {
          id: true,
          conversationId: true,
          mediaUrl: true,
          conversation: { select: { companyId: true } },
        },
      });

      if (toDelete.length === 0) {
        console.log('[MessageDelete] Nenhuma mensagem encontrada para os IDs');
        return jsonResponse({ success: true, deleted_count: 0 });
      }

      const ids = toDelete.map((m) => m.id);
      const deleted = await prisma.message.deleteMany({ where: { id: { in: ids } } });
      const deletedCount = deleted.count;

      // Cleanup das midias no B2 e publica evento realtime
      await Promise.all(toDelete.map(async (m) => {
        if (m.mediaUrl) {
          deleteMediaFromUrl(m.mediaUrl).catch(() => {});
        }
        await publishEvent(m.conversation.companyId, {
          type: 'message:delete',
          conversationId: m.conversationId,
          messageId: m.id,
        });
      }));

      console.log(`[MessageDelete] Deletadas ${deletedCount} mensagens`);

      return jsonResponse({
        success: true,
        message: 'Message(s) deleted',
        deleted_count: deletedCount,
      });
    }
    // ===== FIM: PROCESSAMENTO DE DELETE / REVOKE =====

    // ===== FAST PATH: Validate format and enqueue for async processing =====
    // This allows the webhook to respond in <5ms even under 5000+ concurrent messages
    const isQueueProcessed = req.headers.get('x-queue-processed') === 'true';
    const validationResult = validateAndAdaptPayload(rawPayload);

    if (!validationResult.success) {
      console.error('[Receive] Validation failed:', (validationResult as any).error);
      return jsonResponse({
        success: false,
        error: 'Erro de validação',
      }, 400);
    }

    // If NOT already processed by queue worker, enqueue and return fast
    if (!isQueueProcessed) {
      try {
        await enqueueInboundMessage({
          rawPayload: rawPayload as Record<string, unknown>,
          receivedAt: new Date().toISOString(),
        });
        console.log('[Receive] Message enqueued for async processing');
        return jsonResponse({ success: true, message: 'Message queued for processing' });
      } catch (queueError) {
        console.error('[Receive] Failed to enqueue, falling back to sync processing:', queueError);
        // Fall through to synchronous processing if Redis/queue is unavailable
      }
    }

    // ===== SYNCHRONOUS PROCESSING (queue worker callback or fallback) =====
    const payload = (validationResult as { success: true; data: InternalMessagePayload }).data;

    // Verificar duplicata por uaz_message_id
    const existingMessage = await prisma.message.findFirst({
      where: { uazMessageId: payload.uaz_message_id },
      select: { id: true },
    });

    if (existingMessage) {
      console.log('Duplicate message detected:', payload.uaz_message_id);
      return jsonResponse({
        success: true,
        message: 'Duplicate message ignored',
        message_id: existingMessage.id
      });
    }

    // 1. Buscar company_id através da tabela whatsapp_instances
    const instance = await prisma.whatsappInstance.findFirst({
      where: { instanceName: payload.instance_name },
      select: { companyId: true, isActive: true },
    });

    if (!instance) {
      console.error('WhatsApp instance not found:', payload.instance_name);
      return jsonResponse({
        error: `WhatsApp instance "${payload.instance_name}" not found. Please check if the instance is properly configured.`
      }, 404);
    }

    if (!instance.isActive) {
      console.warn('WhatsApp instance is inactive:', payload.instance_name);
      return jsonResponse({
        error: `WhatsApp instance "${payload.instance_name}" is inactive`
      }, 403);
    }

    const companyId = instance.companyId;
    console.log('Found company via WhatsApp instance:', companyId);

    // 2. Buscar ou criar cliente
    let clientId: string;
    let existingClient: any = null;

    // CENÁRIO 1: Phone é LID (14 dígitos)
    if (payload.is_lid_phone) {
      console.log('[LID Scenario] Phone is LID, searching by whatsapp_lid:', payload.phone);

      const clientByLid = await prisma.client.findFirst({
        where: { companyId, whatsappLid: payload.phone },
        select: { id: true, firstName: true, phone: true, whatsappLid: true, avatarUrl: true },
      });

      if (clientByLid) {
        clientId = clientByLid.id;
        existingClient = clientByLid;
        console.log('[LID Scenario] Found client by LID:', clientId);

        if (payload.real_phone && payload.real_phone !== clientByLid.phone) {
          await prisma.client.update({ where: { id: clientId }, data: { phone: payload.real_phone } });
          console.log('[LID Scenario] Updated phone from LID to real phone:', payload.real_phone);
        }

        if (payload.profile_picture_url && payload.profile_picture_url !== clientByLid.avatarUrl) {
          await prisma.client.update({ where: { id: clientId }, data: { avatarUrl: payload.profile_picture_url } });
          console.log('[LID Scenario] Updated avatar_url');
        }

        if (payload.sender_name &&
            (clientByLid.firstName === clientByLid.phone ||
             clientByLid.firstName === 'Novo Cliente' ||
             !clientByLid.firstName)) {
          await prisma.client.update({ where: { id: clientId }, data: { firstName: payload.sender_name } });
          console.log('[LID Scenario] Updated name from senderName:', payload.sender_name);
        }
      } else {
        console.log('[LID Scenario] Client not found, creating new with LID');
        const clientName = payload.sender_name || payload.metadata?.chat_name || payload.phone;

        const newClient = await prisma.client.create({
          data: {
            companyId,
            phone: payload.real_phone || payload.phone,
            whatsappLid: payload.phone,
            firstName: clientName,
            source: payload.ad_tracking ? `meta_ad` : (payload.channel || 'whatsapp'),
            avatarUrl: payload.profile_picture_url || null,
            ...(payload.ad_tracking ? {
              utmSource: 'meta',
              utmMedium: 'ctwa',
              adId: payload.ad_tracking.ad_id,
              adHeadline: payload.ad_tracking.ad_headline,
              adBody: payload.ad_tracking.ad_body,
              adMediaUrl: payload.ad_tracking.ad_media_url,
              adSourceUrl: payload.ad_tracking.ad_source_url,
              adPlatform: payload.ad_tracking.ad_platform,
            } : {}),
          },
          select: { id: true },
        });

        clientId = newClient.id;
        existingClient = newClient;
        console.log('[LID Scenario] Created client with LID:', payload.phone, 'and real phone:', payload.real_phone, payload.ad_tracking ? '(from Meta ad)' : '');
      }
    } else {
      // CENÁRIO 2: Phone é número normal (10-13 dígitos)
      console.log('[Normal Scenario] Phone is regular number:', payload.phone);

      // Gera todas as variações (com/sem 9 na frente) para matching robusto
      const variants = phoneVariants(payload.phone);
      const orConditions: any[] = [{ phone: { in: variants } }];
      if (payload.whatsapp_lid) {
        orConditions.push({ whatsappLid: payload.whatsapp_lid });
      }

      const clients = await prisma.client.findMany({
        where: { companyId, OR: orConditions },
        select: { id: true, firstName: true, phone: true, whatsappLid: true, avatarUrl: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      });

      existingClient = clients[0] || null;
      console.log('[Client Search] By phone/lid:', payload.phone, payload.whatsapp_lid, 'Found:', !!existingClient);

      if (existingClient) {
        clientId = existingClient.id;
        console.log('[Normal Scenario] Found existing client:', clientId);

        if (payload.whatsapp_lid && !existingClient.whatsappLid) {
          await prisma.client.update({ where: { id: clientId }, data: { whatsappLid: payload.whatsapp_lid } });
          console.log('[Client Update] Added whatsapp_lid:', payload.whatsapp_lid);
        }

        if (payload.profile_picture_url && payload.profile_picture_url !== existingClient.avatarUrl) {
          await prisma.client.update({ where: { id: clientId }, data: { avatarUrl: payload.profile_picture_url } });
          console.log('[Client Update] Updated avatar');
        }

        if (payload.sender_name &&
            (existingClient.firstName === existingClient.phone ||
             existingClient.firstName === 'Novo Cliente' ||
             !existingClient.firstName)) {
          await prisma.client.update({ where: { id: clientId }, data: { firstName: payload.sender_name } });
          console.log('[Client Update] Updated name from senderName:', payload.sender_name);
        }
      } else {
        const clientName = payload.sender_name || payload.metadata?.chat_name || payload.phone;

        const newClient = await prisma.client.create({
          data: {
            companyId,
            phone: canonicalPhone(payload.phone),
            whatsappLid: payload.whatsapp_lid,
            firstName: clientName,
            source: payload.ad_tracking ? `meta_ad` : (payload.channel || 'whatsapp'),
            avatarUrl: payload.profile_picture_url || null,
            ...(payload.ad_tracking ? {
              utmSource: 'meta',
              utmMedium: 'ctwa',
              adId: payload.ad_tracking.ad_id,
              adHeadline: payload.ad_tracking.ad_headline,
              adBody: payload.ad_tracking.ad_body,
              adMediaUrl: payload.ad_tracking.ad_media_url,
              adSourceUrl: payload.ad_tracking.ad_source_url,
              adPlatform: payload.ad_tracking.ad_platform,
            } : {}),
          },
          select: { id: true },
        });

        clientId = newClient.id;
        existingClient = newClient;
        console.log('[Normal Scenario] Created new client:', clientName, payload.ad_tracking ? '(from Meta ad)' : '');
      }
    }

    // 2.5 Update ad tracking on existing client if this message has ad data and client doesn't have it yet
    if (payload.ad_tracking && clientId && existingClient) {
      const currentClient = await prisma.client.findUnique({
        where: { id: clientId },
        select: { adId: true },
      });
      if (currentClient && !currentClient.adId) {
        await prisma.client.update({
          where: { id: clientId },
          data: {
            source: 'meta_ad',
            utmSource: 'meta',
            utmMedium: 'ctwa',
            adId: payload.ad_tracking.ad_id,
            adHeadline: payload.ad_tracking.ad_headline,
            adBody: payload.ad_tracking.ad_body,
            adMediaUrl: payload.ad_tracking.ad_media_url,
            adSourceUrl: payload.ad_tracking.ad_source_url,
            adPlatform: payload.ad_tracking.ad_platform,
          },
        });
        console.log('[Ad Tracking] Updated existing client with ad data:', clientId);
      }
    }

    // 3. Buscar conversa (fechada OU ativa) ou criar nova
    let conversationId: string | undefined;
    let conversationReopened = false;

    if (payload.type === 'incoming') {
      const closedConversation = await prisma.conversation.findFirst({
        where: {
          companyId,
          clientId,
          channel: (payload.channel || 'whatsapp') as any,
          status: 'closed',
        },
        select: { id: true, status: true },
        orderBy: { endedAt: 'desc' },
      });

      if (closedConversation) {
        const reopenedConv = await prisma.conversation.update({
          where: { id: closedConversation.id },
          data: {
            status: 'active',
            endedAt: null,
            updatedAt: new Date(),
          },
          select: { id: true },
        });

        conversationId = reopenedConv.id;
        conversationReopened = true;
        console.log('Reopened closed conversation:', conversationId);
      }
    }

    if (!conversationId) {
      const activeConversations = await prisma.conversation.findMany({
        where: {
          companyId,
          clientId,
          status: 'active',
          channel: (payload.channel || 'whatsapp') as any,
        },
        select: { id: true, startedAt: true },
        orderBy: { startedAt: 'asc' },
      });

      if (activeConversations && activeConversations.length > 0) {
        conversationId = activeConversations[0].id;

        if (activeConversations.length > 1) {
          console.warn(`[Warning] Client ${clientId} has ${activeConversations.length} active conversations. Using oldest: ${conversationId}. Duplicates: ${activeConversations.slice(1).map(c => c.id).join(', ')}`);
        }

        console.log('Found existing active conversation:', conversationId);
      }
    }

    if (!conversationId) {
      const newConversation = await prisma.conversation.create({
        data: {
          companyId,
          clientId,
          channel: (payload.channel || 'whatsapp') as any,
          status: 'active',
          aiHandled: payload.type === 'outgoing',
          stage: 'mensagem_fixa',
        },
        select: { id: true },
      });

      conversationId = newConversation.id;
      console.log('Created new conversation:', conversationId);
    }

    // 3.5. Buscar instância do WhatsApp completa (com API keys para mídia e transcrição)
    const whatsappInstance = await prisma.whatsappInstance.findFirst({
      where: { companyId, isActive: true },
      select: { instanceApiKey: true, apiUrl: true },
    });

    const aiConfig = await prisma.aiConfiguration.findFirst({
      where: { companyId },
      select: { apiKeys: true },
      orderBy: { createdAt: 'desc' },
    });

    const openAiKey = (aiConfig?.apiKeys as any)?.openai || process.env.DEFAULT_OPENAI_API_KEY;
    console.log('[AI Config] OpenAI key source:', (aiConfig?.apiKeys as any)?.openai ? 'company' : 'default_secret');

    // 3.6. Processar mídia do WhatsApp
    const mediaTypes = ['image', 'video', 'audio', 'ptt', 'document', 'sticker'];
    const isMediaMessage = mediaTypes.includes(payload.message_type || '');
    const hasMediaUrl = !!payload.media_url;
    const hasMessageId = !!rawPayload.message?.id;
    const hasInstance = !!whatsappInstance;
    const isAudioMessage = ['audio', 'ptt'].includes(payload.message_type || '');

    console.log('[Media Check] isMediaMessage:', isMediaMessage,
                '| isAudio:', isAudioMessage,
                '| hasMediaUrl:', hasMediaUrl,
                '| hasMessageId:', hasMessageId,
                '| hasInstance:', hasInstance,
                '| message_type:', payload.message_type,
                '| openAiKey available:', !!openAiKey);

    const mediaMessageId = rawPayload.message?.messageid || rawPayload.message?.id;

    const shouldQueueMedia = isMediaMessage && mediaMessageId && hasInstance && conversationId;
    let shouldQueueTranscription = isAudioMessage && openAiKey && hasInstance && mediaMessageId;
    if (isAudioMessage && !openAiKey) {
      console.warn('[Audio Transcription] Skipped! openAiKey not available');
    }
    if (isAudioMessage) {
      payload.message = payload.message || '[Áudio - transcrevendo...]';
    }

    // 4. Verificar duplicatas: ignorar apenas mensagens enviadas VIA API
    if (payload.type === 'outgoing' && payload.was_sent_by_api) {
      console.log('[Duplicate Prevention] Ignoring API-sent message (already saved by send-message)');
      console.log('[Duplicate Prevention] UAZ Message ID:', payload.uaz_message_id);

      return jsonResponse({
        success: true,
        message: 'API-sent message ignored (already processed)',
        uaz_message_id: payload.uaz_message_id,
      });
    }

    // 4.1 Rede de segurança para ecos outgoing: se UAZapi não sinalizou was_sent_by_api,
    // tentar "casar" este webhook com uma Message recém-criada pelo send-* route
    // (mesma conversa, sender agent/ai, sem uazMessageId, últimos 2 minutos).
    // Quando casa, faz UPDATE do uazMessageId em vez de criar duplicata.
    if (payload.type === 'outgoing') {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      const candidate = await prisma.message.findFirst({
        where: {
          conversationId,
          senderType: { in: ['agent', 'ai'] },
          uazMessageId: null,
          createdAt: { gte: twoMinutesAgo },
          ...(payload.message_type ? { messageType: payload.message_type } : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (candidate) {
        try {
          await prisma.message.update({
            where: { id: candidate.id },
            data: { uazMessageId: payload.uaz_message_id },
          });
          console.log('[Duplicate Prevention] Matched echo to existing message, updated uazMessageId:', candidate.id);
          return jsonResponse({
            success: true,
            message: 'Outgoing echo matched to existing message',
            message_id: candidate.id,
          });
        } catch (matchErr: any) {
          // Se já existe outra mensagem com esse uazMessageId (unique constraint), é duplicata: ignora
          if (matchErr?.code === 'P2002') {
            console.log('[Duplicate Prevention] uazMessageId already exists, treating as duplicate');
            return jsonResponse({
              success: true,
              message: 'Duplicate outgoing echo ignored',
            });
          }
          throw matchErr;
        }
      }
    }

    // 5. Determinar sender_type e inserir mensagem
    const senderType = payload.type === 'incoming' ? 'client' : 'agent';
    let message: { id: string; createdAt: Date };
    try {
      message = await prisma.message.create({
        data: {
          conversationId,
          senderType,
          messageText: payload.message,
          messageType: payload.message_type || 'text',
          mediaUrl: payload.media_url,
          uazMessageId: payload.uaz_message_id,
          quotedMessageId: payload.quoted_message_id,
          metadata: {
            ...payload.metadata,
            channel: payload.channel as any,
            profile_picture_url: payload.profile_picture_url,
            uaz_message_id: payload.uaz_message_id,
            quoted_message_id: payload.quoted_message_id,
          },
        },
        select: { id: true, createdAt: true },
      });
    } catch (createErr: any) {
      // P2002: outro processo/worker já criou a mesma mensagem (uazMessageId unique)
      if (createErr?.code === 'P2002') {
        const existing = await prisma.message.findFirst({
          where: { uazMessageId: payload.uaz_message_id },
          select: { id: true, createdAt: true },
        });
        if (existing) {
          console.log('[Duplicate Prevention] Race caught by unique constraint:', existing.id);
          return jsonResponse({
            success: true,
            message: 'Duplicate message ignored (unique constraint)',
            message_id: existing.id,
          });
        }
      }
      throw createErr;
    }

    console.log('Created message:', message.id);

    // Publica evento realtime para clientes SSE conectados (awaited — fire-and-forget
    // pode ser cancelado pelo event loop antes do Redis confirmar o publish)
    await publishEvent(companyId, {
      type: 'message:new',
      conversationId,
      message: {
        id: message.id,
        conversationId,
        senderType,
        messageText: payload.message,
        messageType: payload.message_type || 'text',
        mediaUrl: payload.media_url,
        uazMessageId: payload.uaz_message_id,
        quotedMessageId: payload.quoted_message_id,
        createdAt: message.createdAt,
        metadata: payload.metadata,
      },
    });
    console.log(`[Realtime] publicado message:new para conversation ${conversationId} (company ${companyId})`);

    // Push notification: so para mensagens incoming (cliente enviou)
    if (payload.type === 'incoming') {
      const notifTitle = payload.sender_name || payload.metadata?.chat_name || 'Nova mensagem';
      const notifBody =
        payload.message_type === 'image' ? '📷 Imagem' :
        payload.message_type === 'video' ? '🎥 Vídeo' :
        payload.message_type === 'audio' || payload.message_type === 'ptt' ? '🎤 Áudio' :
        payload.message_type === 'document' ? '📄 Documento' :
        payload.message_type === 'location' ? '📍 Localização' :
        (payload.message || '').substring(0, 120);

      sendPushToCompany(companyId, {
        title: notifTitle,
        body: notifBody,
        tag: `conversation-${conversationId}`,
        icon: payload.profile_picture_url || '/icon-192x192.png',
        data: {
          url: `/app/conversations?conversation=${conversationId}`,
          conversationId,
          messageId: message.id,
        },
      }).catch((err) => console.warn('[Push] falha ao enviar:', err));
    }

    // 5. Enviar webhook para N8N via fila (non-blocking)
    if (payload.type === 'incoming' || payload.type === 'outgoing') {
      const [aiConfigResult, clientDataResult, apiKeyResult, companyDataResult, convDataResult] = await Promise.all([
        prisma.aiConfiguration.findFirst({
          where: { companyId, isActive: true },
          select: { n8nWebhookUrl: true, knowledge: true, memoryKey: true, productsKnowledge: true },
        }),
        prisma.client.findUnique({
          where: { id: clientId },
          select: { firstName: true, lastName: true, aiPaused: true },
        }),
        prisma.apiKey.findFirst({
          where: { companyId, isActive: true },
          select: { key: true },
        }),
        prisma.company.findUnique({
          where: { id: companyId },
          select: { name: true, settings: true },
        }),
        prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { stage: true, friendlyId: true },
        }),
      ]);

      const companyAiConfig = aiConfigResult;
      const clientData = clientDataResult;
      const companyApiKey = apiKeyResult;
      const companyData = companyDataResult;
      const conversationData = convDataResult;

      const n8nWebhookUrl = companyAiConfig?.n8nWebhookUrl || process.env.N8N_AI_WEBHOOK_URL;
      const knowledgeName = companyAiConfig?.knowledge || null;
      const memoryKeyName = companyAiConfig?.memoryKey || null;
      const productsKnowledgeName = companyAiConfig?.productsKnowledge || null;

      const defaultBusinessHours = {
        monday: { enabled: true, start: '08:00', end: '18:00' },
        tuesday: { enabled: true, start: '08:00', end: '18:00' },
        wednesday: { enabled: true, start: '08:00', end: '18:00' },
        thursday: { enabled: true, start: '08:00', end: '18:00' },
        friday: { enabled: true, start: '08:00', end: '18:00' },
        saturday: { enabled: false, start: '08:00', end: '12:00' },
        sunday: { enabled: false, start: '08:00', end: '12:00' }
      };

      const companyBusinessHours = (companyData?.settings as Record<string, unknown>)?.business_hours || defaultBusinessHours;

      const defaultAppointmentSettings = {
        duracao_padrao_minutos: 45,
        intervalo_slots_minutos: 5,
        antecedencia_minima_horas: 2,
        antecedencia_maxima_dias: 30,
      };

      const companyAppointmentSettings = (companyData?.settings as Record<string, unknown>)?.appointment_settings as Record<string, unknown> | undefined;
      const noticeMinutes = companyAppointmentSettings
        ? (typeof companyAppointmentSettings.min_notice_minutes === 'number'
            ? companyAppointmentSettings.min_notice_minutes
            : ((companyAppointmentSettings.min_notice_hours as number) || 2) * 60)
        : 120;
      const configuracoesAgendamento = companyAppointmentSettings ? {
        duracao_padrao_minutos: companyAppointmentSettings.default_duration_minutes || 45,
        intervalo_slots_minutos: companyAppointmentSettings.slot_interval_minutes || 15,
        antecedencia_minima_minutos: noticeMinutes,
        antecedencia_minima_horas: noticeMinutes / 60,
        antecedencia_maxima_dias: companyAppointmentSettings.advance_booking_days || 30,
      } : defaultAppointmentSettings;

      const clientName = clientData
        ? `${clientData.firstName} ${clientData.lastName || ''}`.trim()
        : payload.phone;

      const aiStatus = clientData?.aiPaused ? 'paused' : 'active';

      let fullMediaUrl: string | null = null;
      if (payload.media_url) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        fullMediaUrl = payload.media_url.startsWith('http')
          ? payload.media_url
          : `${appUrl}/uploads/${payload.media_url}`;
      }

      const webhookPayload = {
        tipo_mensagem: payload.message_type || 'text',
        conteudo: payload.message,
        nome_cliente: clientName,
        numero_cliente: payload.phone,
        company_id: companyId,
        conversation_id: conversationId,
        conversation_friendly_id: conversationData?.friendlyId || null,
        client_id: clientId,
        fromMe: payload.type === 'outgoing',
        stage: conversationData?.stage || null,
        media_url: fullMediaUrl,
        company_name: companyData?.name || null,
        horario_funcionamento: companyBusinessHours,
        configuracoes_agendamento: configuracoesAgendamento,
        ai_status: aiStatus,
        knowledge: knowledgeName,
        memory_key: memoryKeyName,
        products_knowledge: productsKnowledgeName,
        api_key: companyApiKey?.key || null,
        message_id: message.id,
        timestamp: new Date().toISOString(),
      };

      // For audio messages: skip N8N, transcription worker sends it after transcription
      if (shouldQueueTranscription && whatsappInstance && mediaMessageId) {
        console.log(`[N8N Webhook] ⏳ Skipping for audio message ${message.id} — will send after transcription`);
        try {
          await enqueueTranscription({
            messageId: message.id,
            conversationId,
            companyId,
            audioUrl: payload.media_url || '',
            instanceApiUrl: whatsappInstance.apiUrl || '',
            instanceApiKey: whatsappInstance.instanceApiKey || '',
            messageKey: mediaMessageId,
            n8nWebhookUrl: n8nWebhookUrl || undefined,
            n8nPayload: webhookPayload,
          });
          console.log('[Audio Transcription] ✅ Queued transcription job for message', message.id);
        } catch (queueError) {
          console.error('[Audio Transcription] Failed to queue transcription:', queueError);
        }
      } else if (shouldQueueMedia && whatsappInstance && mediaMessageId) {
        console.log(`[N8N Webhook] ⏳ Skipping for media message ${message.id} — will send after S3 upload`);
        try {
          await enqueueMediaProcessing({
            messageId: message.id,
            conversationId,
            companyId,
            mediaUrl: payload.media_url || '',
            mediaType: (payload.message_type as any) || 'document',
            mimeType: rawPayload.message?.content && typeof rawPayload.message.content === 'object'
              ? (rawPayload.message.content as any).mimetype || 'application/octet-stream'
              : 'application/octet-stream',
            instanceApiUrl: whatsappInstance.apiUrl || '',
            instanceApiKey: whatsappInstance.instanceApiKey || '',
            messageKey: mediaMessageId,
            n8nWebhookUrl: n8nWebhookUrl || undefined,
            n8nPayload: webhookPayload,
          });
          console.log('[Media Processing] ✅ Queued for message', message.id);
        } catch (queueError) {
          console.error('[Media Processing] Failed to queue:', queueError);
        }
      } else if (n8nWebhookUrl) {
        try {
          await enqueueN8NWebhook({
            webhookUrl: n8nWebhookUrl,
            payload: webhookPayload,
            companyId,
            conversationId,
            messageId: message.id,
          });
          console.log(`[N8N Webhook] ✅ Queued for message ${message.id} (ai_status: ${aiStatus})`);
        } catch (queueError) {
          console.error('[N8N Webhook] Failed to queue, falling back to sync:', queueError);
          try {
            await fetch(n8nWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(webhookPayload),
            });
          } catch (syncError) {
            console.error('[N8N Webhook] Sync fallback also failed:', syncError);
          }
        }
      } else {
        console.log('[N8N Webhook] No webhook URL configured, skipping');
      }
    }

    // ===== INÍCIO: Criar jobs de follow-up =====
    if (payload.type === 'incoming') {
      console.log('[Follow-up] Processing incoming message for follow-up jobs...');

      // Cancelar jobs de follow-up pendentes quando cliente responde
      await prisma.followUpJob.updateMany({
        where: { conversationId, status: 'pending' },
        data: { status: 'cancelled' },
      });
      console.log('[Follow-up] Cancelled pending jobs due to client response');

      // GUARD: Verificar se a IA está pausada para este cliente (atendimento manual)
      const followUpClient = await prisma.client.findUnique({
        where: { id: clientId },
        select: { aiPaused: true },
      });

      // GUARD: Verificar se a conversa está ativa
      const followUpConv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { status: true },
      });

      const shouldCreateFollowUps = !followUpClient?.aiPaused && followUpConv?.status !== 'closed';

      if (!shouldCreateFollowUps) {
        console.log(`[Follow-up] Skipping follow-up creation: ai_paused=${followUpClient?.aiPaused}, conv_status=${followUpConv?.status}`);
      } else {
        const followUpAiConfig = await prisma.aiConfiguration.findFirst({
          where: { companyId, isActive: true },
          select: { followUpStages: true, whatsappInstanceId: true, followUpEnabled: true },
        });

        if (followUpAiConfig?.followUpEnabled && (followUpAiConfig.followUpStages as any)?.length > 0) {
          const followUpStages = (followUpAiConfig.followUpStages as any[]).filter((s: any) => s.enabled !== false);
          const messageReceivedAt = new Date(message.createdAt);

          if (followUpStages.length === 0) {
            console.log('[Follow-up] All stages are disabled, skipping job creation');
          } else {
            console.log(`[Follow-up] Creating ${followUpStages.length} jobs for conversation ${conversationId} (${(followUpAiConfig.followUpStages as any[]).length - followUpStages.length} disabled)`);

            const followUpClientData = await prisma.client.findUnique({
              where: { id: clientId },
              select: { firstName: true, phone: true },
            });

            const jobsToUpsert = followUpStages.map((stage: any) => {
              const scheduledFor = new Date(messageReceivedAt);
              scheduledFor.setHours(scheduledFor.getHours() + (stage.delay_hours || 24));

              let messageText = stage.message || '';
              if (followUpClientData) {
                messageText = messageText
                  .replace(/\[client_name\]/g, followUpClientData.firstName || 'Cliente')
                  .replace(/\[client_phone\]/g, followUpClientData.phone || '');
              }

              return {
                conversationId: conversationId!,
                companyId,
                clientId,
                stageOrder: stage.order,
                scheduledFor,
                messageText,
                whatsappInstanceId: followUpAiConfig.whatsappInstanceId,
                status: 'pending' as const,
              };
            });

            // Use transactions to upsert follow-up jobs
            for (const job of jobsToUpsert) {
              try {
                const existing = await prisma.followUpJob.findFirst({
                  where: { conversationId: job.conversationId, stageOrder: job.stageOrder },
                });

                if (existing) {
                  await prisma.followUpJob.update({
                    where: { id: existing.id },
                    data: job,
                  });
                } else {
                  await prisma.followUpJob.create({ data: job });
                }
              } catch (jobError) {
                console.error('[Follow-up] Error upserting job:', jobError);
              }
            }

            console.log(`[Follow-up] Successfully created/updated ${jobsToUpsert.length} jobs`);
          }
        } else {
          console.log('[Follow-up] Follow-up disabled or no stages configured');
        }
      }
    }
    // ===== FIM: Criar jobs de follow-up =====

    // Retornar sucesso
    return jsonResponse({
      success: true,
      data: {
        message_id: message.id,
        conversation_id: conversationId,
        client_id: clientId,
        company_id: companyId,
        created_at: message.createdAt,
        conversation_reopened: conversationReopened,
      },
    });
  } catch (error) {
    console.error('Error in receive-message function:', error);
    return errorResponse('Erro interno do servidor', 500);
  }
}
