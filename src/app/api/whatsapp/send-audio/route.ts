import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticate } from '@/lib/api/auth';
import { getWhatsAppInstance, findOrCreateConversation, saveMessage, getClientPhoneByConversationId } from '@/lib/api/database';
import { sendToWhatsApp } from '@/lib/api/whatsapp';
import { handleCors, jsonResponse } from '@/lib/api/cors';
import { uploadToB2, buildB2Key, MIME_TO_EXT } from '@/lib/storage';

const sendAudioSchema = z.object({
  audioBase64: z.string(),
  conversationId: z.string().uuid().optional(),
  phone: z.string().optional(),
  duration: z.number().optional(),
  mimeType: z.string().optional(),
  fromAI: z.boolean().optional(),
});

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = sendAudioSchema.safeParse(body);

    if (!validation.success) {
      return jsonResponse({ error: 'Dados inválidos', details: validation.error.flatten().fieldErrors }, 400);
    }

    const payload = validation.data;
    const { audioBase64, duration, mimeType, fromAI } = payload;

    let phone = payload.phone;
    let conversationId = payload.conversationId;

    if (!phone && conversationId) {
      const fetchedPhone = await getClientPhoneByConversationId(conversationId);
      if (!fetchedPhone) return jsonResponse({ error: 'Could not find client phone for conversation' }, 404);
      phone = fetchedPhone;
    }

    if (!phone || !audioBase64) return jsonResponse({ error: 'Missing phone or audioBase64' }, 400);

    const { agentId, companyId } = await authenticate(req);
    if (!companyId) return jsonResponse({ error: 'Company not identified' }, 400);
    console.log(`[send-audio-message] Authenticated - companyId: ${companyId}`);

    const instance = await getWhatsAppInstance(companyId);
    if (!conversationId) conversationId = await findOrCreateConversation(phone || '', companyId);

    // Upload audio para o B2 (mesmo padrão usado pelo restante do sistema)
    const buffer = Buffer.from(audioBase64, 'base64');
    const normalizedMime = mimeType?.includes('mp4')
      ? 'audio/mp4'
      : mimeType?.includes('webm')
        ? 'audio/webm'
        : mimeType?.includes('ogg')
          ? 'audio/ogg'
          : mimeType?.includes('mpeg') || mimeType?.includes('mp3')
            ? 'audio/mpeg'
            : 'audio/ogg';
    const extension = MIME_TO_EXT[normalizedMime] || 'ogg';
    const key = buildB2Key('audio', companyId, conversationId, extension);

    const publicUrl = await uploadToB2(buffer, key, normalizedMime);
    console.log('[send-audio-message] Audio uploaded to B2:', publicUrl);

    const message = await saveMessage(
      conversationId,
      '',
      'audio',
      fromAI || false,
      agentId,
      publicUrl,
      { duration, mime_type: normalizedMime, storage: 'b2' }
    );

    const uazPayload = { phone, type: 'ptt', file: publicUrl, fromAI: fromAI || false, company_id: companyId };
    const { success, error: whatsappError } = await sendToWhatsApp(instance, '/send/media', uazPayload, message.id);
    if (!success) console.error('[send-audio-message] Failed to send WhatsApp audio:', whatsappError);

    return jsonResponse({
      success: true,
      message_id: message.id,
      conversation_id: conversationId,
      audio_url: publicUrl,
    });
  } catch (error) {
    console.error('[send-audio-message] Error:', error);
    return jsonResponse({ error: 'Erro interno do servidor' }, 500);
  }
}
