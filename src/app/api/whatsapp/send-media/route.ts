import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { getWhatsAppInstance, findOrCreateConversation, saveMessage, getUAZMessageId, getClientPhoneByConversationId } from '@/lib/api/database';
import { sendToWhatsApp, marcarFalhaEnvio } from '@/lib/api/whatsapp';
import { explicarFalhaEnvio, textoDaFalhaEnvio } from '@/lib/erros/envio';
import { validateMediaPayload } from '@/lib/api/utils';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';
import fs from 'fs';
import path from 'path';
import { handleApiErrorCors } from '@/lib/api/errors'
import { checarEnvioDaIA, marcarRespondido, registrarBloqueio } from '@/lib/ai/turns';

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

const sendMediaSchema = z.object({
  conversationId: z.string().uuid().optional(),
  file: z.string(),
  type: z.string(),
  phone: z.string().optional(),
  fromAI: z.boolean().optional(),
  text: z.string().optional(),
  docName: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  replyToMessageId: z.string().uuid().optional(),
  replyid: z.string().optional(),
  mentions: z.any().optional(),
  readchat: z.boolean().optional(),
  readmessages: z.boolean().optional(),
  delay: z.number().optional(),
  forward: z.boolean().optional(),
  track_source: z.string().optional(),
  track_id: z.string().optional(),
});

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
  // Local file path - read from public/uploads directory
  const localPath = path.join(process.cwd(), 'public', 'uploads', file);
  if (fs.existsSync(localPath)) {
    const bytes = fs.readFileSync(localPath);
    return uint8ArrayToBase64(new Uint8Array(bytes));
  }
  throw new Error(`Could not resolve media file: ${file}`);
}

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    console.log('[send-message-media] Processing request...');
    const body = await req.json();
    const validation = sendMediaSchema.safeParse(body);

    if (!validation.success) {
      return jsonResponse({ success: false, error: 'INVALID_PAYLOAD', details: validation.error.flatten().fieldErrors }, 400);
    }

    const payload = validation.data;

    let phone = payload.phone;
    if (!phone && payload.conversationId) {
      const fetchedPhone = await getClientPhoneByConversationId(payload.conversationId);
      if (!fetchedPhone) throw new Error('Could not find client phone for this conversation');
      phone = fetchedPhone;
      payload.phone = phone;
    }

    validateMediaPayload(payload);
    console.log('[send-message-media] Type:', payload.type, '| Phone:', payload.phone);

    const { agentId, companyId } = await authenticate(req);
    if (!companyId) throw new Error('Company not identified');
    // IDOR: conversa informada precisa ser deste restaurante (sem isto a
    // mensagem era gravada/enviada na conversa de outro restaurante).
    if (payload.conversationId) {
      const dono = await prisma.conversation.findFirst({
        where: { id: payload.conversationId, companyId },
        select: { id: true },
      });
      if (!dono) return jsonResponse({ success: false, error: 'Conversa não encontrada.', code: 'CONVERSATION_NOT_FOUND' }, 404);
    }
    const instance = await getWhatsAppInstance(companyId);
    const conversationId = payload.conversationId || await findOrCreateConversation(payload.phone || '', companyId);

    // Pausa da IA vale pro fluxo inteiro (ver send-text).
    if (payload.fromAI) {
      const envio = await checarEnvioDaIA(companyId, conversationId);
      if (!envio.permitido) {
        await registrarBloqueio(companyId, conversationId, envio.ate);
        return jsonResponse({ success: false, error: 'IA pausada para este cliente: resposta não enviada.', code: 'AI_PAUSED', paused_until: envio.ate }, 409);
      }
    }

    let replyid: string | undefined;
    if (payload.replyToMessageId) {
      const uazMessageId = await getUAZMessageId(payload.replyToMessageId);
      if (uazMessageId) replyid = uazMessageId;
    }

    const messageText = payload.text || '';

    const message = await saveMessage(conversationId, messageText, payload.type, payload.fromAI || false, agentId, payload.file, {
      uaz_payload: payload, text: payload.text, docName: payload.docName, fileSize: payload.fileSize, mimeType: payload.mimeType,
    });

    // WhatsApp Cloud: o adapter manda o LINK pra Meta baixar e so aceita https;
    // em base64 o envio sempre falhava. Demais canais seguem com base64.
    const conversa = await prisma.conversation.findFirst({
      where: { id: conversationId, companyId },
      select: { inbox: { select: { channelType: true } } },
    });
    const usarLink = conversa?.inbox?.channelType === 'whatsapp_cloud' && /^https:\/\//i.test(payload.file);

    let fileParaEnvio: string;
    try {
      fileParaEnvio = usarLink ? payload.file : await resolveFileToBase64(payload.file);
    } catch (resolveErr) {
      // A mensagem ja foi gravada: sem isto ela ficava na tela como enviada.
      const raw = await marcarFalhaEnvio(message.id, `Arquivo nao pode ser lido: ${textoDaFalhaEnvio(resolveErr)}`, { companyId });
      const falha = explicarFalhaEnvio(raw);
      return jsonResponse({ success: false, message_id: message.id, error: falha.motivo, motivo: falha.motivo, o_que_fazer: falha.oQueFazer }, 500);
    }
    console.log('[send-message-media] Media ready.', usarLink ? 'Link https (WhatsApp Cloud)' : `Base64 length: ${fileParaEnvio.length}`);

    const uazPayload: any = { number: payload.phone, type: payload.type, file: fileParaEnvio, fromAI: payload.fromAI || false, company_id: companyId };
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

    if (!success) {
      // Texto cru ja ficou na mensagem (send_error); aqui so a explicacao simples.
      // Numero sem WhatsApp nao e falha do sistema: 200 pro fluxo seguir (ver send-text).
      const falha = explicarFalhaEnvio(error);
      const numeroSemWhatsApp = falha.codigo === 'numero_invalido';
      return jsonResponse({
        success: false,
        message_id: message.id,
        error: falha.motivo,
        ...(numeroSemWhatsApp && { code: 'PHONE_NOT_ON_WHATSAPP' }),
        motivo: falha.motivo,
        o_que_fazer: falha.oQueFazer,
      }, numeroSemWhatsApp ? 200 : 500);
    }

    if (payload.fromAI) await marcarRespondido(companyId, conversationId, messageText || `[${payload.type}]`);

    return jsonResponse({ success: true, message_id: message.id, conversation_id: conversationId, sender_type: payload.fromAI ? 'ai' : 'agent', media_type: payload.type });
  } catch (error) {
    return handleApiErrorCors(error, '[send-message-media] Error')
  }
}
