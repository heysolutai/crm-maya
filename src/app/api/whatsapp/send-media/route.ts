import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/api/auth';
import { getWhatsAppInstance, findOrCreateConversation, saveMessage, getUAZMessageId, getClientPhoneByConversationId } from '@/lib/api/database';
import { sendToWhatsApp } from '@/lib/api/whatsapp';
import { validateMediaPayload } from '@/lib/api/utils';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';

function normalizeBase64(input: string): string {
  const stripped = input.trim().replace(/^data:[^;]+;base64,/, '');
  const base64 = stripped.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  return pad ? base64 + '='.repeat(4 - pad) : base64;
}

function isProbablyBase64(input: string): boolean {
  const normalized = normalizeBase64(input);
  return normalized.length >= 128 && normalized.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(normalized);
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function resolveFileToBase64(file: string): Promise<string> {
  if (/^data:/i.test(file)) {
    const parts = file.split(',');
    if (parts.length < 2 || !parts[1]) throw new Error('Invalid data URL');
    return normalizeBase64(parts[1]);
  }
  if (isProbablyBase64(file)) return normalizeBase64(file);
  if (/^https?:\/\//i.test(file)) {
    const url = new URL(file);
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', 'metadata.google.internal'];
    if (blockedHosts.includes(url.hostname) || /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(url.hostname)) {
      throw new Error('URL points to a blocked internal address');
    }
    const res = await fetch(file);
    if (!res.ok) throw new Error(`Failed to fetch media URL (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return uint8ArrayToBase64(bytes);
  }
  // Supabase Storage path
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from('conversation-media').download(file);
  if (error || !data) throw new Error(`Could not download media from storage: ${error?.message ?? 'unknown error'}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  return uint8ArrayToBase64(bytes);
}

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    console.log('[send-message-media] Processing request...');
    const payload = await req.json();

    let phone = payload.phone;
    if (!phone && payload.conversationId) {
      phone = await getClientPhoneByConversationId(payload.conversationId);
      if (!phone) throw new Error('Could not find client phone for this conversation');
      payload.phone = phone;
    }

    validateMediaPayload(payload);
    console.log('[send-message-media] Type:', payload.type, '| Phone:', payload.phone);

    const { agentId, companyId } = await authenticate(req);
    const instance = await getWhatsAppInstance(companyId);
    const conversationId = payload.conversationId || await findOrCreateConversation(payload.phone, companyId);

    let replyid: string | undefined;
    if (payload.replyToMessageId) {
      const uazMessageId = await getUAZMessageId(payload.replyToMessageId);
      if (uazMessageId) replyid = uazMessageId;
    }

    const messageText = payload.text ||
      (payload.type === 'audio' || payload.type === 'myaudio' || payload.type === 'ptt' ? '🎤 Áudio' :
       payload.type === 'image' ? '🖼️ Imagem' :
       payload.type === 'video' ? '🎥 Vídeo' :
       payload.type === 'document' ? `📄 ${payload.docName || 'Documento'}` : '📎 Sticker');

    const message = await saveMessage(conversationId, messageText, payload.type, payload.fromAI || false, agentId, payload.file, {
      uaz_payload: payload, text: payload.text, docName: payload.docName, fileSize: payload.fileSize, mimeType: payload.mimeType,
    });

    const fileBase64 = await resolveFileToBase64(payload.file);
    console.log('[send-message-media] Media resolved to base64. Length:', fileBase64.length);

    const uazPayload: any = { number: payload.phone, type: payload.type, file: fileBase64, fromAI: payload.fromAI || false, company_id: companyId };
    if (payload.text) uazPayload.text = payload.text;
    if (payload.docName) uazPayload.docName = payload.docName;
    if (replyid) uazPayload.replyid = replyid;
    else if (payload.replyid) uazPayload.replyid = payload.replyid;
    if (payload.mentions) uazPayload.mentions = payload.mentions;
    if (payload.readchat !== undefined) uazPayload.readchat = payload.readchat;
    if (payload.readmessages !== undefined) uazPayload.readmessages = payload.readmessages;
    if (payload.delay) uazPayload.delay = payload.delay;
    if (payload.forward !== undefined) uazPayload.forward = payload.forward;
    if (payload.track_source) uazPayload.track_source = payload.track_source;
    if (payload.track_id) uazPayload.track_id = payload.track_id;

    const { success, error } = await sendToWhatsApp(instance, '/send/media', uazPayload, message.id);

    if (!success) return jsonResponse({ success: false, message_id: message.id, error: error || 'Failed to send WhatsApp message' }, 500);

    return jsonResponse({ success: true, message_id: message.id, conversation_id: conversationId, sender_type: payload.fromAI ? 'ai' : 'agent', media_type: payload.type });
  } catch (error) {
    console.error('[send-message-media] Error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error');
  }
}
