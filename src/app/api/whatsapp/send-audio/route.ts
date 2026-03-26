import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/api/auth';
import { getWhatsAppInstance, findOrCreateConversation, saveMessage, getClientPhoneByConversationId } from '@/lib/api/database';
import { sendToWhatsApp } from '@/lib/api/whatsapp';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const { audioBase64, duration, mimeType, fromAI } = payload;

    let phone = payload.phone;
    let conversationId = payload.conversationId;

    if (!phone && conversationId) {
      phone = await getClientPhoneByConversationId(conversationId);
      if (!phone) return jsonResponse({ error: 'Could not find client phone for conversation' }, 404);
    }

    if (!phone || !audioBase64) return jsonResponse({ error: 'Missing phone or audioBase64' }, 400);

    const { agentId, companyId } = await authenticate(req);
    console.log(`[send-audio-message] Authenticated - companyId: ${companyId}`);

    const instance = await getWhatsAppInstance(companyId);
    if (!conversationId) conversationId = await findOrCreateConversation(phone, companyId);

    const supabase = createAdminClient();

    // Convert base64 to Uint8Array
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

    const extension = mimeType?.includes('mp4') ? 'mp4' : mimeType?.includes('webm') ? 'webm' : mimeType?.includes('ogg') ? 'ogg' : 'webm';
    const fileName = `audio_${conversationId}_${Date.now()}.${extension}`;
    const filePath = `audios/${companyId}/${fileName}`;

    const { error: uploadError } = await supabase.storage.from('conversation-media').upload(filePath, bytes, { contentType: mimeType || 'audio/webm', upsert: false });
    if (uploadError) throw new Error('Failed to upload audio file');

    const mediaPath = filePath;
    console.log('[send-audio-message] Audio uploaded to path:', mediaPath);

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage.from('conversation-media').createSignedUrl(filePath, 3600);
    if (signedUrlError) throw new Error('Failed to generate signed URL for WhatsApp');

    const message = await saveMessage(conversationId, `🎤 Áudio (${duration || 0}s)`, 'audio', fromAI || false, agentId, mediaPath, { duration, file_path: filePath, mime_type: mimeType });

    const uazPayload = { phone, type: 'ptt', file: signedUrlData.signedUrl, fromAI: fromAI || false, company_id: companyId };
    const { success, error: whatsappError } = await sendToWhatsApp(instance, '/send/media', uazPayload, message.id);
    if (!success) console.error('[send-audio-message] Failed to send WhatsApp audio:', whatsappError);

    // Optional external webhook
    const webhookUrl = process.env.EXTERNAL_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_type: 'audio', audio_url: mediaPath, duration, phone, instance_name: instance.instance_name, instance_id: instance.instance_name, timestamp: new Date().toISOString() }),
        });
      } catch (e) { console.error('[send-audio-message] Webhook failed:', e); }
    }

    return jsonResponse({ success: true, message_id: message.id, conversation_id: conversationId, audio_url: mediaPath, webhook_sent: !!webhookUrl });
  } catch (error) {
    console.error('[send-audio-message] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse({ error: errorMessage }, errorMessage.includes('Authentication') ? 401 : 500);
  }
}
