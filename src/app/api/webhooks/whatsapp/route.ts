import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { handleCors, jsonResponse, errorResponse, badRequestResponse } from '@/lib/api/cors';
import { enqueueN8NWebhook, enqueueTranscription, enqueueMediaProcessing } from '@/lib/queue';

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
  }),
  sender: z.object({
    profilePicUrl: z.union([z.string().url(), z.literal('')]).optional(),
  }).optional(),
});

type UAZapiPayload = z.infer<typeof UAZapiPayloadSchema>;

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

    // Extrair texto da mensagem com fallback baseado no tipo
    const messageText = uazPayload.message.text
      || (typeof uazPayload.message.content === 'string' ? uazPayload.message.content : '')
      || (messageType === 'image' ? '🖼️ Imagem' :
          messageType === 'video' ? '🎥 Vídeo' :
          messageType === 'audio' || messageType === 'ptt' ? '🎤 Áudio' :
          messageType === 'document' ? '📄 Documento' :
          messageType === 'location' ? '📍 Localização' :
          mediaUrl ? '📎 Mídia' : '');

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
      // MENSAGEM OUTGOING: usar chat.phone (destinatário = cliente)
      console.log('[Outgoing Message] Using chat.phone as client phone');
      const rawChatPhone = chatPhone;
      if (!rawChatPhone) {
        return {
          success: false,
          error: 'chat.phone is required for outgoing messages'
        };
      }
      phone = rawChatPhone.split('@')[0].replace(/\D/g, '');
      // Para mensagens outgoing, usar APENAS chatName (nome do contato)
      // NÃO usar senderName porque é o nome do AGENTE, não do cliente!
      clientName = chatName || undefined;

      // Para mensagens outgoing, NÃO capturar sender_lid (seria o LID do agente)
      // Cliente será identificado apenas pelo phone
      // lidNumeric permanece undefined

      console.log('[Phone Final] Outgoing - phone:', phone, 'no LID capture (client identified by phone only)');
    } else {
      // MENSAGEM INCOMING: usar sender_pn/sender_lid (remetente = cliente)
      console.log('[Incoming Message] Using sender_pn/sender_lid as client phone');

      // Extrair telefone de sender_pn
      if (senderPnJid) {
        phoneFromPn = senderPnJid.split('@')[0].replace(/\D/g, '');
        console.log('[Phone Extraction] From sender_pn:', phoneFromPn);
      }

      // Extrair LID numérico se existir
      if (senderLidJid) {
        lidNumeric = senderLidJid.split('@')[0].replace(/\D/g, '');
        console.log('[LID Extraction] From sender_lid:', lidNumeric);
      }

      // Determinar phone final
      if (phoneFromPn) {
        phone = phoneFromPn;
        console.log('[Phone Final] Using sender_pn:', phone);
      } else if (lidNumeric) {
        phone = lidNumeric;

        // Detectar se é LID (14 dígitos)
        if (phone.length === 14) {
          isLid = true;
          console.log('[LID Detection] Phone is a LID (14 digits):', phone);
        }

        console.log('[Phone Final] Using sender_lid number:', phone, 'isLid:', isLid);
      } else if (chatPhone) {
        // Último fallback: limpar chat.phone
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

    // Validar comprimento do número limpo
    if (phone.length < 10 || phone.length > 15) {
      return {
        success: false,
        error: `Invalid phone number format (length: ${phone.length})`
      };
    }

  // whatsapp_lid = apenas o número do LID (sem @lid)
  const whatsappLid: string | undefined = lidNumeric;

  console.log('[Final Values] phone:', phone,
              'whatsapp_lid:', whatsappLid,
              'sender_name:', clientName,
              'fromMe:', uazPayload.message.fromMe);

    // ID da mensagem citada (priorizar message.quoted, fallback para quotedMsg.messageid)
    const quotedMessageId = uazPayload.message.quoted ||
                            uazPayload.message.quotedMsg?.messageid;

    if (quotedMessageId) {
      console.log('[Reply Detection] quoted_message_id:', quotedMessageId);
    }

    // Validar URL de mídia se presente
    if (mediaUrl) {
      try {
        new URL(mediaUrl);
      } catch {
        console.warn(`[Validation] Invalid media URL: ${mediaUrl}`);
      }
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
        metadata: {
          uaz_full_id: uazPayload.message.id,
          chat_name: uazPayload.chat.name,
          sender_name: senderName,
          sender_pn: senderPnJid,
          sender_lid: senderLidJid,
          validated: true,
          validation_timestamp: new Date().toISOString(),
          // Dados de localização (se houver)
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
      error: error instanceof Error ? error.message : 'Unknown validation error'
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

    // LOG COMPLETO para debug
    console.log('[Media Download] UAZapi response:', JSON.stringify(result));
    console.log('[Media Download] Response keys:', Object.keys(result));

    // Tentar múltiplos campos possíveis - base64Data é o campo correto do UAZapi
    const base64Data = result.base64Data || result.base64 || result.data || result.file || result.content;
    const mimeType = result.mimetype || result.mimeType || result.mime_type || 'application/octet-stream';
    const fileURL = result.fileURL;  // URL pública já fornecida pelo UAZapi

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
 * Upload de mídia para Supabase Storage
 */
async function uploadMediaToStorage(
  base64Data: string,
  messageType: string,
  companyId: string,
  conversationId: string,
  mimeType: string,
  supabaseClient: any
): Promise<string | null> {
  try {
    console.log('[Storage Upload] Starting upload, type:', messageType, 'mime:', mimeType);

    // Converter base64 para Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Determinar extensão do arquivo
    const extensionMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'video/mp4': 'mp4',
      'application/pdf': 'pdf',
    };
    const extension = extensionMap[mimeType] || mimeType.split('/')[1] || 'bin';

    // Caminho do arquivo no storage
    const fileName = `${messageType}_${conversationId}_${Date.now()}.${extension}`;
    const filePath = `${messageType}s/${companyId}/${fileName}`;

    const { data, error } = await supabaseClient.storage
      .from('conversation-media')
      .upload(filePath, bytes, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      console.error('[Storage Upload] Error:', error);
      return null;
    }

    // Return the file path (not public URL since bucket is now private)
    // Frontend will generate signed URLs for access
    console.log('[Storage Upload] Success, path:', filePath);
    return filePath;
  } catch (error) {
    console.error('[Storage Upload] Exception:', error);
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

    // Converter base64 para bytes
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Determinar extensão
    const extMap: Record<string, string> = {
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'audio/wav': 'wav',
      'audio/webm': 'webm',
      'audio/x-m4a': 'm4a',
    };
    const ext = extMap[mimeType] || 'ogg';

    // Criar FormData para Whisper API
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
    // Ignorar eventos que não são mensagens para reduzir logs e processamento
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

      const supabase = createAdminClient();

      // Localizar a mensagem original pelo uaz_message_id
      let originalMessage: any = null;

      for (const msgId of messageIds) {
        // Tentar buscar pelo ID exato
        const { data: exactMatch } = await supabase
          .from('messages')
          .select('id, conversation_id, content, metadata, sender_type')
          .eq('uaz_message_id', msgId)
          .maybeSingle();

        if (exactMatch) {
          originalMessage = exactMatch;
          console.log('[TranscribedMessage] Found message by exact match:', msgId);
          break;
        }

        // Tentar buscar por sufixo (formato phone:id)
        const { data: suffixMatches } = await supabase
          .from('messages')
          .select('id, conversation_id, content, metadata, sender_type')
          .like('uaz_message_id', `%${msgId}`)
          .limit(1);

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

      const { error: updateError } = await supabase
        .from('messages')
        .update({
          content: transcriptionText,
          metadata: updatedMetadata,
        })
        .eq('id', originalMessage.id);

      if (updateError) {
        console.error('[TranscribedMessage] Error updating message:', updateError);
      } else {
        console.log('[TranscribedMessage] Message updated with transcription:', originalMessage.id);
      }

      // Reenviar para N8N se a mensagem era incoming (cliente enviou áudio)
      if (originalMessage.sender_type === 'client') {
        // Buscar conversation para pegar company_id e client_id
        const { data: convData } = await supabase
          .from('conversations')
          .select('company_id, client_id, stage, friendly_id')
          .eq('id', originalMessage.conversation_id)
          .maybeSingle();

        if (convData) {
          // Buscar webhook URL
          const { data: aiConfig } = await supabase
            .from('ai_configurations')
            .select('n8n_webhook_url, knowledge')
            .eq('company_id', convData.company_id)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

          const n8nUrl = aiConfig?.n8n_webhook_url || process.env.N8N_AI_WEBHOOK_URL;

          if (n8nUrl) {
            // Buscar dados do cliente
            const { data: clientData } = await supabase
              .from('clients')
              .select('first_name, last_name, phone, ai_paused')
              .eq('id', convData.client_id)
              .maybeSingle();

            // Buscar API key
            const { data: apiKey } = await supabase
              .from('api_keys')
              .select('key')
              .eq('company_id', convData.company_id)
              .eq('is_active', true)
              .limit(1)
              .maybeSingle();

            // Buscar dados da empresa
            const { data: companyData } = await supabase
              .from('companies')
              .select('name, settings')
              .eq('id', convData.company_id)
              .maybeSingle();

            const clientName = clientData
              ? `${clientData.first_name} ${clientData.last_name || ''}`.trim()
              : 'Cliente';

            const webhookPayload = {
              tipo_mensagem: 'audio_transcription',
              conteudo: transcriptionText,
              nome_cliente: clientName,
              numero_cliente: clientData?.phone || '',
              company_id: convData.company_id,
              conversation_id: originalMessage.conversation_id,
              conversation_friendly_id: convData.friendly_id || null,
              client_id: convData.client_id,
              fromMe: false, // Transcrição é sempre de mensagem do cliente
              stage: convData.stage || null,
              media_url: null,
              company_name: companyData?.name || null,
              ai_status: clientData?.ai_paused ? 'paused' : 'active',
              knowledge: aiConfig?.knowledge || null,
              api_key: apiKey?.key || null,
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
    // Se for webhook de status de leitura, processar e retornar
    if (rawPayload.type === 'ReadReceipt' && rawPayload.event?.MessageIDs) {
      console.log('[ReadReceipt] Processing message status update...');

      const supabase = createAdminClient();

      const messageIds = rawPayload.event.MessageIDs as string[];
      const state = rawPayload.state; // "Delivered" ou "Read"

      // Mapear state para read_status do banco
      let readStatus: 'sent' | 'delivered' | 'read' = 'sent';
      if (state === 'Delivered') {
        readStatus = 'delivered';
      } else if (state === 'Read') {
        readStatus = 'read';
      }

      console.log(`[ReadReceipt] Updating ${messageIds.length} messages to status: ${readStatus}`);
      console.log(`[ReadReceipt] Message IDs from webhook:`, messageIds);

      // Tentar atualizar pelo ID exato primeiro
      let { data: updatedMessages, error: updateError } = await supabase
        .from('messages')
        .update({
          read_status: readStatus,
          read_at: state === 'Read' ? new Date().toISOString() : undefined,
        })
        .in('uaz_message_id', messageIds)
        .select('id, conversation_id, read_status, uaz_message_id');

      // Se não encontrou nenhuma, tentar buscar por sufixo (formato phone:id)
      if ((!updatedMessages || updatedMessages.length === 0) && messageIds.length > 0) {
        console.log('[ReadReceipt] No exact match found, trying suffix match...');

        // Buscar mensagens que terminam com o ID (ex: "5512999:3EB0ABA67E" matches "3EB0ABA67E")
        for (const msgId of messageIds) {
          const { data: suffixMatches, error: suffixError } = await supabase
            .from('messages')
            .update({
              read_status: readStatus,
              read_at: state === 'Read' ? new Date().toISOString() : undefined,
            })
            .ilike('uaz_message_id', `%${msgId}`)
            .select('id, conversation_id, read_status, uaz_message_id');

          if (!suffixError && suffixMatches && suffixMatches.length > 0) {
            console.log(`[ReadReceipt] Found ${suffixMatches.length} messages with suffix match for ${msgId}`);
            updatedMessages = [...(updatedMessages || []), ...suffixMatches];
          }
        }
      }

      if (updateError) {
        console.error('[ReadReceipt] Error updating message status:', updateError);
        return errorResponse(updateError.message, 500);
      }

      console.log(`[ReadReceipt] Successfully updated ${updatedMessages?.length || 0} messages:`, updatedMessages?.map(m => ({ id: m.id, uaz_id: m.uaz_message_id, status: m.read_status })));

      return jsonResponse({
        success: true,
        message: 'Message status updated',
        updated_count: updatedMessages?.length || 0,
        status: readStatus,
      });
    }
    // ===== FIM: PROCESSAMENTO DE READ RECEIPTS =====

    // Validar e adaptar payload
    const validationResult = validateAndAdaptPayload(rawPayload);

    if (!validationResult.success) {
      console.error('[Receive] Validation failed:', (validationResult as any).error);
      return jsonResponse({
        success: false,
        error: (validationResult as any).error,
        received_payload: rawPayload
      }, 400);
    }

    const payload = (validationResult as { success: true; data: InternalMessagePayload }).data;
    console.log('[Receive] Validated and adapted payload:', payload);

    // Criar cliente Supabase
    const supabase = createAdminClient();

    // Verificar duplicata por uaz_message_id
    const { data: existingMessage } = await supabase
      .from('messages')
      .select('id')
      .eq('uaz_message_id', payload.uaz_message_id)
      .maybeSingle();

    if (existingMessage) {
      console.log('Duplicate message detected:', payload.uaz_message_id);
      return jsonResponse({
        success: true,
        message: 'Duplicate message ignored',
        message_id: existingMessage.id
      });
    }

    // 1. Buscar company_id através da tabela whatsapp_instances
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('company_id, is_active')
      .eq('instance_name', payload.instance_name)
      .single();

    if (instanceError || !instance) {
      console.error('WhatsApp instance not found:', payload.instance_name, instanceError);
      return jsonResponse({
        error: `WhatsApp instance "${payload.instance_name}" not found. Please check if the instance is properly configured.`
      }, 404);
    }

    // Verificar se a instância está ativa
    if (!instance.is_active) {
      console.warn('WhatsApp instance is inactive:', payload.instance_name);
      return jsonResponse({
        error: `WhatsApp instance "${payload.instance_name}" is inactive`
      }, 403);
    }

    const companyId = instance.company_id;
    console.log('Found company via WhatsApp instance:', companyId);

    // 2. Buscar ou criar cliente
    let clientId: string;
    let existingClient: any = null;

    // CENÁRIO 1: Phone é LID (14 dígitos)
    if (payload.is_lid_phone) {
      console.log('[LID Scenario] Phone is LID, searching by whatsapp_lid:', payload.phone);

      // Buscar por whatsapp_lid usando o LID
      const { data: clientByLid } = await supabase
        .from('clients')
        .select('id, first_name, phone, whatsapp_lid, avatar_url')
        .eq('company_id', companyId)
        .eq('whatsapp_lid', payload.phone)
        .maybeSingle();

      if (clientByLid) {
        clientId = clientByLid.id;
        existingClient = clientByLid;
        console.log('[LID Scenario] Found client by LID:', clientId);

        // Se temos telefone real do sender_pn, atualizar o phone do cliente
        if (payload.real_phone && payload.real_phone !== clientByLid.phone) {
          await supabase
            .from('clients')
            .update({ phone: payload.real_phone })
            .eq('id', clientId);
          console.log('[LID Scenario] Updated phone from LID to real phone:', payload.real_phone);
        }

        // Atualizar avatar se disponível
        if (payload.profile_picture_url && payload.profile_picture_url !== clientByLid.avatar_url) {
          await supabase
            .from('clients')
            .update({ avatar_url: payload.profile_picture_url })
            .eq('id', clientId);
          console.log('[LID Scenario] Updated avatar_url');
        }

        // Atualizar nome se necessário
        if (payload.sender_name &&
            (clientByLid.first_name === clientByLid.phone ||
             clientByLid.first_name === 'Novo Cliente' ||
             !clientByLid.first_name)) {
          await supabase
            .from('clients')
            .update({ first_name: payload.sender_name })
            .eq('id', clientId);
          console.log('[LID Scenario] Updated name from senderName:', payload.sender_name);
        }
      } else {
        // Cliente com esse LID não existe, criar novo
        console.log('[LID Scenario] Client not found, creating new with LID');

        const clientName = payload.sender_name || payload.metadata?.chat_name || payload.phone;

        const { data: newClient, error: clientError } = await supabase
          .from('clients')
          .insert({
            company_id: companyId,
            phone: payload.real_phone || payload.phone,
            whatsapp_lid: payload.phone,
            first_name: clientName,
            source: payload.channel || 'whatsapp',
            avatar_url: payload.profile_picture_url || null,
          })
          .select('id')
          .single();

        if (clientError || !newClient) {
          console.error('[LID Scenario] Error creating client:', clientError);
          return errorResponse('Failed to create client', 500);
        }

        clientId = newClient.id;
        existingClient = newClient;
        console.log('[LID Scenario] Created client with LID:', payload.phone, 'and real phone:', payload.real_phone);
      }
    } else {
      // CENÁRIO 2: Phone é número normal (10-13 dígitos)
      console.log('[Normal Scenario] Phone is regular number:', payload.phone);

      // Buscar cliente existente por phone OU whatsapp_lid em uma única query
      // Usar .limit(1) + .order para evitar erro com múltiplos registros (duplicatas)
      // Prioriza o cliente mais antigo (o original)
      const orConditions: string[] = [`phone.eq.${payload.phone}`];
      if (payload.whatsapp_lid) {
        orConditions.push(`whatsapp_lid.eq.${payload.whatsapp_lid}`);
      }

      const { data: clients, error: clientSearchError } = await supabase
        .from('clients')
        .select('id, first_name, phone, whatsapp_lid, avatar_url')
        .eq('company_id', companyId)
        .or(orConditions.join(','))
        .order('created_at', { ascending: true })
        .limit(1);

      if (clientSearchError) {
        console.error('[Client Search] Error:', clientSearchError);
      }

      existingClient = clients?.[0] || null;
      console.log('[Client Search] By phone/lid:', payload.phone, payload.whatsapp_lid, 'Found:', !!existingClient);

      if (existingClient) {
        clientId = existingClient.id;
        console.log('[Normal Scenario] Found existing client:', clientId);

        // Atualizar whatsapp_lid se não estava definido
        if (payload.whatsapp_lid && !existingClient.whatsapp_lid) {
          await supabase
            .from('clients')
            .update({ whatsapp_lid: payload.whatsapp_lid })
            .eq('id', clientId);
          console.log('[Client Update] Added whatsapp_lid:', payload.whatsapp_lid);
        }

        // Atualizar avatar se disponível
        if (payload.profile_picture_url && payload.profile_picture_url !== existingClient.avatar_url) {
          await supabase
            .from('clients')
            .update({ avatar_url: payload.profile_picture_url })
            .eq('id', clientId);
          console.log('[Client Update] Updated avatar');
        }

        // Atualizar nome se necessário
        if (payload.sender_name &&
            (existingClient.first_name === existingClient.phone ||
             existingClient.first_name === 'Novo Cliente' ||
             !existingClient.first_name)) {
          await supabase
            .from('clients')
            .update({ first_name: payload.sender_name })
            .eq('id', clientId);
          console.log('[Client Update] Updated name from senderName:', payload.sender_name);
        }
      } else {
        // Criar novo cliente
        const clientName = payload.sender_name ||
                           payload.metadata?.chat_name ||
                           payload.phone;

        const { data: newClient, error: clientError } = await supabase
          .from('clients')
          .insert({
            company_id: companyId,
            phone: payload.phone,
            whatsapp_lid: payload.whatsapp_lid,
            first_name: clientName,
            source: payload.channel || 'whatsapp',
            avatar_url: payload.profile_picture_url || null,
          })
          .select('id')
          .single();

        if (clientError || !newClient) {
          console.error('[Normal Scenario] Error creating client:', clientError);
          return errorResponse('Failed to create client', 500);
        }

        clientId = newClient.id;
        existingClient = newClient;
        console.log('[Normal Scenario] Created new client:', clientName);
      }
    }

    // 3. Buscar conversa (fechada OU ativa) ou criar nova
    let conversationId: string | undefined;
    let conversationReopened = false;

    // Se for mensagem incoming, buscar primeiro conversa fechada mais recente
    if (payload.type === 'incoming') {
      const { data: closedConversation } = await supabase
        .from('conversations')
        .select('id, status')
        .eq('company_id', companyId)
        .eq('client_id', clientId)
        .eq('channel', (payload.channel || 'whatsapp') as any)
        .eq('status', 'closed' as any)
        .order('ended_at', { ascending: false })
        .limit(1)
        .single();

      // Se encontrou conversa fechada, reabrir
      if (closedConversation) {
        const { data: reopenedConv, error: reopenError } = await supabase
          .from('conversations')
          .update({
            status: 'active',
            ended_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', closedConversation.id)
          .select('id')
          .single();

        if (!reopenError && reopenedConv) {
          conversationId = reopenedConv.id;
          conversationReopened = true;
          console.log('Reopened closed conversation:', conversationId);
        }
      }
    }

    // Se não reabriu, buscar conversa ativa (usar a mais antiga para evitar duplicatas)
    if (!conversationId) {
      const { data: activeConversations } = await supabase
        .from('conversations')
        .select('id, started_at')
        .eq('company_id', companyId)
        .eq('client_id', clientId)
        .eq('status', 'active' as any)
        .eq('channel', (payload.channel || 'whatsapp') as any)
        .order('started_at', { ascending: true }); // Mais antiga primeiro

      if (activeConversations && activeConversations.length > 0) {
        // Usar a conversa mais antiga (a original)
        conversationId = activeConversations[0].id;

        // Log warning se houver duplicatas
        if (activeConversations.length > 1) {
          console.warn(`[Warning] Client ${clientId} has ${activeConversations.length} active conversations. Using oldest: ${conversationId}. Duplicates: ${activeConversations.slice(1).map(c => c.id).join(', ')}`);
        }

        console.log('Found existing active conversation:', conversationId);
      }
    }

    // Se ainda não tem conversationId, criar nova
    if (!conversationId) {
      const { data: newConversation, error: conversationError } = await supabase
        .from('conversations')
        .insert({
          company_id: companyId,
          client_id: clientId,
          channel: (payload.channel || 'whatsapp') as any,
          status: 'active' as any,
          ai_handled: payload.type === 'outgoing',
          stage: 'mensagem_fixa',
        } as any)
        .select('id')
        .single();

      if (conversationError || !newConversation) {
        console.error('Error creating conversation:', conversationError);
        return errorResponse('Failed to create conversation', 500);
      }

      conversationId = newConversation.id;
      console.log('Created new conversation:', conversationId);

      // Lead distribution is now handled via the transfer-conversation API endpoint
    }

    // 3.5. Buscar instância do WhatsApp completa (com API keys para mídia e transcrição)
    const { data: whatsappInstance } = await supabase
      .from('whatsapp_instances')
      .select('instance_api_key, api_url')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single();

    // Buscar chave OpenAI INDEPENDENTE do status da configuração
    // Transcrição deve funcionar sempre que a chave estiver configurada
    const { data: aiConfig } = await supabase
      .from('ai_configurations')
      .select('api_keys')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Usar chave OpenAI da empresa, ou fallback padrão (secret) para garantir transcrição sempre
    const openAiKey = (aiConfig?.api_keys as any)?.openai || process.env.DEFAULT_OPENAI_API_KEY;
    console.log('[AI Config] OpenAI key source:', (aiConfig?.api_keys as any)?.openai ? 'company' : 'default_secret');

    // 3.6. Processar mídia do WhatsApp — SEMPRE baixar e salvar no Storage
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

    // Use messageid (short) with fallback to id (full owner:messageid format)
    const mediaMessageId = rawPayload.message?.messageid || rawPayload.message?.id;

    // Media processing will be queued after message insert (needs message ID)
    const shouldQueueMedia = isMediaMessage && mediaMessageId && hasInstance && conversationId;

    // 3.7. Audio transcription — queued in background after message insert
    // (Transcription job is enqueued after message is saved to DB, see below)
    let shouldQueueTranscription = isAudioMessage && openAiKey && hasInstance && mediaMessageId;
    if (isAudioMessage && !openAiKey) {
      console.warn('[Audio Transcription] Skipped! openAiKey not available');
    }
    if (isAudioMessage) {
      // Set placeholder text for audio messages
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

    // 5. Determinar sender_type e inserir mensagem
    const senderType = payload.type === 'incoming' ? 'client' : 'agent';
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: senderType,
        message_text: payload.message,
        message_type: payload.message_type || 'text',
        media_url: payload.media_url,
        uaz_message_id: payload.uaz_message_id,
        quoted_message_id: payload.quoted_message_id,
        metadata: {
          ...payload.metadata,
          channel: payload.channel,
          profile_picture_url: payload.profile_picture_url,
          uaz_message_id: payload.uaz_message_id,
          quoted_message_id: payload.quoted_message_id,
        },
      })
      .select('id, created_at')
      .single();

    if (messageError || !message) {
      console.error('Error creating message:', messageError);
      return errorResponse('Failed to create message', 500);
    }

    console.log('Created message:', message.id);

    // 5.5. AI pause removido - agora só manual ou via API

    // ===== Queue: Transcription job — enqueued later (after N8N payload is built) =====

    // ===== Queue: Media processing job — enqueued later (after N8N payload is built) =====

    // 5. Enviar webhook para N8N via fila (non-blocking)
    if (payload.type === 'incoming' || payload.type === 'outgoing') {
      // Buscar URL de webhook e knowledge (paralelo com outros dados)
      const [aiConfigResult, clientDataResult, apiKeyResult, companyDataResult, convDataResult] = await Promise.all([
        supabase
          .from('ai_configurations')
          .select('n8n_webhook_url, knowledge')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('clients')
          .select('first_name, last_name, ai_paused')
          .eq('id', clientId)
          .maybeSingle(),
        supabase
          .from('api_keys')
          .select('key')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('companies')
          .select('name, settings')
          .eq('id', companyId)
          .maybeSingle(),
        supabase
          .from('conversations')
          .select('stage, friendly_id')
          .eq('id', conversationId)
          .maybeSingle(),
      ]);

      const companyAiConfig = aiConfigResult.data;
      const clientData = clientDataResult.data;
      const companyApiKey = apiKeyResult.data;
      const companyData = companyDataResult.data;
      const conversationData = convDataResult.data;

      const n8nWebhookUrl = companyAiConfig?.n8n_webhook_url || process.env.N8N_AI_WEBHOOK_URL;
      const knowledgeName = companyAiConfig?.knowledge || null;

      // Build webhook payload (needed for both N8N and transcription worker)
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
        ? `${clientData.first_name} ${clientData.last_name || ''}`.trim()
        : payload.phone;

      const aiStatus = clientData?.ai_paused ? 'paused' : 'active';

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      let fullMediaUrl: string | null = null;
      if (payload.media_url) {
        fullMediaUrl = payload.media_url.startsWith('http')
          ? payload.media_url
          : `${supabaseUrl}/storage/v1/object/public/conversation-media/${payload.media_url}`;
      }

      const webhookPayload = {
        tipo_mensagem: payload.message_type || 'text',
        conteudo: payload.message,
        nome_cliente: clientName,
        numero_cliente: payload.phone,
        company_id: companyId,
        conversation_id: conversationId,
        conversation_friendly_id: conversationData?.friendly_id || null,
        client_id: clientId,
        fromMe: payload.type === 'outgoing',
        stage: conversationData?.stage || null,
        media_url: fullMediaUrl,
        company_name: companyData?.name || null,
        horario_funcionamento: companyBusinessHours,
        configuracoes_agendamento: configuracoesAgendamento,
        ai_status: aiStatus,
        knowledge: knowledgeName,
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
            instanceApiUrl: whatsappInstance.api_url,
            instanceApiKey: whatsappInstance.instance_api_key,
            messageKey: mediaMessageId,
            n8nWebhookUrl: n8nWebhookUrl || undefined,
            n8nPayload: webhookPayload,
          });
          console.log('[Audio Transcription] ✅ Queued transcription job for message', message.id);
        } catch (queueError) {
          console.error('[Audio Transcription] Failed to queue transcription:', queueError);
        }
      // For media messages (image, video, document, sticker): skip N8N, media worker sends it after upload to S3
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
            instanceApiUrl: whatsappInstance.api_url,
            instanceApiKey: whatsappInstance.instance_api_key,
            messageKey: mediaMessageId,
            n8nWebhookUrl: n8nWebhookUrl || undefined,
            n8nPayload: webhookPayload,
          });
          console.log('[Media Processing] ✅ Queued for message', message.id);
        } catch (queueError) {
          console.error('[Media Processing] Failed to queue:', queueError);
        }
      } else if (n8nWebhookUrl) {
        // Text messages: send N8N immediately
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
      const { error: cancelError } = await supabase
        .from('follow_up_jobs')
        .update({ status: 'cancelled' })
        .eq('conversation_id', conversationId)
        .eq('status', 'pending');

      if (!cancelError) {
        console.log('[Follow-up] Cancelled pending jobs due to client response');
      }

      // GUARD: Verificar se a IA está pausada para este cliente (atendimento manual)
      const { data: followUpClient } = await supabase
        .from('clients')
        .select('ai_paused')
        .eq('id', clientId)
        .single();

      // GUARD: Verificar se a conversa está ativa
      const { data: followUpConv } = await supabase
        .from('conversations')
        .select('status')
        .eq('id', conversationId)
        .single();

      const shouldCreateFollowUps = !followUpClient?.ai_paused && followUpConv?.status !== 'closed';

      if (!shouldCreateFollowUps) {
        console.log(`[Follow-up] Skipping follow-up creation: ai_paused=${followUpClient?.ai_paused}, conv_status=${followUpConv?.status}`);
      } else {
        // Buscar configuração de IA da empresa
        const { data: aiConfig } = await supabase
          .from('ai_configurations')
          .select('follow_up_stages, whatsapp_instance_id, follow_up_enabled')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .maybeSingle();

        if (aiConfig?.follow_up_enabled && (aiConfig.follow_up_stages as any)?.length > 0) {
          // Filtrar apenas stages habilitados (enabled !== false para retrocompatibilidade)
          const followUpStages = (aiConfig.follow_up_stages as any[]).filter((s: any) => s.enabled !== false);
          const messageReceivedAt = new Date(message.created_at);

          if (followUpStages.length === 0) {
            console.log('[Follow-up] All stages are disabled, skipping job creation');
          } else {
            console.log(`[Follow-up] Creating ${followUpStages.length} jobs for conversation ${conversationId} (${(aiConfig.follow_up_stages as any[]).length - followUpStages.length} disabled)`);

          // Buscar dados do cliente para substituir variáveis
          const { data: clientData } = await supabase
            .from('clients')
            .select('first_name, phone')
            .eq('id', clientId)
            .single();

          // Criar um job para cada stage habilitado
          const jobsToUpsert = followUpStages.map((stage: any) => {
            const scheduledFor = new Date(messageReceivedAt);
            scheduledFor.setHours(scheduledFor.getHours() + (stage.delay_hours || 24));

            // Substituir variáveis na mensagem
            let messageText = stage.message || '';
            if (clientData) {
              messageText = messageText
                .replace(/\[client_name\]/g, clientData.first_name || 'Cliente')
                .replace(/\[client_phone\]/g, clientData.phone || '');
            }

            return {
              conversation_id: conversationId,
              company_id: companyId,
              client_id: clientId,
              stage_order: stage.order,
              scheduled_for: scheduledFor.toISOString(),
              message_text: messageText,
              whatsapp_instance_id: aiConfig.whatsapp_instance_id,
              status: 'pending',
            };
          });

          // Fazer UPSERT dos jobs (atualiza se existir, cria se não existir)
          const { error: jobsError } = await supabase
            .from('follow_up_jobs')
            .upsert(jobsToUpsert, {
              onConflict: 'conversation_id,stage_order',
              ignoreDuplicates: false,
            });

          if (jobsError) {
            console.error('[Follow-up] Error creating jobs:', jobsError);
          } else {
            console.log(`[Follow-up] Successfully created/updated ${jobsToUpsert.length} jobs`);
          }
          } // end if followUpStages.length > 0
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
        created_at: message.created_at,
        conversation_reopened: conversationReopened,
      },
    });
  } catch (error) {
    console.error('Error in receive-message function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return errorResponse(errorMessage, 500);
  }
}
