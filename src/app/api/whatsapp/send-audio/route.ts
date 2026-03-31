import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { getWhatsAppInstance, findOrCreateConversation, saveMessage, getClientPhoneByConversationId } from '@/lib/api/database';
import { sendToWhatsApp } from '@/lib/api/whatsapp';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';
import fs from 'fs';
import path from 'path';

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

    // Convert base64 to Buffer and save to filesystem
    const buffer = Buffer.from(audioBase64, 'base64');

    const extension = mimeType?.includes('mp4') ? 'mp4' : mimeType?.includes('webm') ? 'webm' : mimeType?.includes('ogg') ? 'ogg' : 'webm';
    const fileName = `audio_${conversationId}_${Date.now()}.${extension}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'audios', companyId);

    // Ensure directory exists
    fs.mkdirSync(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, buffer);

    const mediaPath = `audios/${companyId}/${fileName}`;
    console.log('[send-audio-message] Audio saved to:', mediaPath);

    // Generate a URL for WhatsApp
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const fileUrl = `${appUrl}/uploads/${mediaPath}`;

    const message = await saveMessage(conversationId, `🎤 Áudio (${duration || 0}s)`, 'audio', fromAI || false, agentId, mediaPath, { duration, file_path: mediaPath, mime_type: mimeType });

    const uazPayload = { phone, type: 'ptt', file: fileUrl, fromAI: fromAI || false, company_id: companyId };
    const { success, error: whatsappError } = await sendToWhatsApp(instance, '/send/media', uazPayload, message.id);
    if (!success) console.error('[send-audio-message] Failed to send WhatsApp audio:', whatsappError);

    // Optional external webhook
    const webhookUrl = process.env.EXTERNAL_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_type: 'audio', audio_url: mediaPath, duration, phone, instance_name: (instance as any).instance_name || (instance as any).instanceName, timestamp: new Date().toISOString() }),
        });
      } catch (e) { console.error('[send-audio-message] Webhook failed:', e); }
    }

    return jsonResponse({ success: true, message_id: message.id, conversation_id: conversationId, audio_url: mediaPath, webhook_sent: !!webhookUrl });
  } catch (error) {
    console.error('[send-audio-message] Error:', error);
    return jsonResponse({ error: 'Erro interno do servidor' }, 500);
  }
}
