import { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth';
import { getWhatsAppInstance, findOrCreateConversation, saveMessage, getUAZMessageId, getClientPhoneByConversationId } from '@/lib/api/database';
import { sendToWhatsApp } from '@/lib/api/whatsapp';
import { validateTextPayload } from '@/lib/api/utils';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';

const apiError = (message: string, errorCode: string, status: number, extra?: Record<string, unknown>) =>
  jsonResponse({ success: false, error: errorCode, message, ...extra }, status);

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const t0 = Date.now();
    console.log('[send-message-text] Processing request...');

    const payload = await req.json();

    // Fetch phone from conversation if not provided
    let phone = payload.phone;
    if (!phone && payload.conversationId) {
      phone = await getClientPhoneByConversationId(payload.conversationId);
      if (!phone) return apiError('Não foi possível encontrar o telefone do cliente para esta conversa.', 'CLIENT_PHONE_NOT_FOUND', 404);
      payload.phone = phone;
    }

    try { validateTextPayload(payload); } catch (validationError) {
      return apiError(`Dados inválidos: ${(validationError as Error).message}`, 'INVALID_PAYLOAD', 400);
    }

    console.log('[send-message-text] Phone:', payload.phone, '| FromAI:', payload.fromAI || false);

    // Parallel: auth + reply lookup
    const authPromise = authenticate(req);
    const replyPromise = payload.replyToMessageId ? getUAZMessageId(payload.replyToMessageId) : Promise.resolve(null);
    const [authResult, replyid] = await Promise.all([authPromise, replyPromise]);
    const { agentId, companyId } = authResult;

    console.log('[send-message-text] Auth done:', Date.now() - t0, 'ms');

    // Parallel: instance + conversation
    const instancePromise = getWhatsAppInstance(companyId).catch(() => null);
    const conversationPromise = payload.conversationId ? Promise.resolve(payload.conversationId) : findOrCreateConversation(payload.phone, companyId);
    const [instance, conversationId] = await Promise.all([instancePromise, conversationPromise]);

    if (!instance) return apiError('WhatsApp não configurado ou desconectado.', 'WHATSAPP_NOT_CONNECTED', 503);

    console.log('[send-message-text] Instance + Conv done:', Date.now() - t0, 'ms');

    const message = await saveMessage(conversationId, payload.message, 'text', payload.fromAI || false, agentId, undefined, { uaz_payload: payload });

    console.log('[send-message-text] Message saved:', Date.now() - t0, 'ms');

    // Build UAZapi payload
    const uazPayload: Record<string, unknown> = {
      number: payload.phone, text: payload.message, fromAI: payload.fromAI || false, company_id: companyId,
    };
    if (payload.linkPreview !== undefined) uazPayload.linkPreview = payload.linkPreview;
    if (payload.linkPreviewTitle) uazPayload.linkPreviewTitle = payload.linkPreviewTitle;
    if (payload.linkPreviewDescription) uazPayload.linkPreviewDescription = payload.linkPreviewDescription;
    if (payload.linkPreviewImage) uazPayload.linkPreviewImage = payload.linkPreviewImage;
    if (payload.linkPreviewLarge !== undefined) uazPayload.linkPreviewLarge = payload.linkPreviewLarge;
    if (replyid) uazPayload.replyid = replyid;
    else if (payload.replyid) uazPayload.replyid = payload.replyid;
    if (payload.mentions) uazPayload.mentions = payload.mentions;
    if (payload.readchat !== undefined) uazPayload.readchat = payload.readchat;
    if (payload.readmessages !== undefined) uazPayload.readmessages = payload.readmessages;
    if (payload.delay) uazPayload.delay = payload.delay;
    if (payload.forward !== undefined) uazPayload.forward = payload.forward;
    if (payload.track_source) uazPayload.track_source = payload.track_source;
    if (payload.track_id) uazPayload.track_id = payload.track_id;

    const { success, error } = await sendToWhatsApp(instance, '/send/text', uazPayload, message.id);

    console.log('[send-message-text] Total time:', Date.now() - t0, 'ms');

    if (!success) return apiError('Falha ao enviar mensagem pelo WhatsApp.', 'WHATSAPP_SEND_FAILED', 500, { message_id: message.id });

    return jsonResponse({ success: true, message_id: message.id, conversation_id: conversationId, sender_type: payload.fromAI ? 'ai' : 'agent' });
  } catch (error) {
    console.error('[send-message-text] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    let message = 'Erro interno do servidor ao enviar mensagem.';
    let errorCode = 'INTERNAL_ERROR';
    if (errorMessage.includes('not authenticated') || errorMessage.includes('401')) { message = 'Sessão expirada. Faça login novamente.'; errorCode = 'UNAUTHENTICATED'; }
    else if (errorMessage.includes('WhatsApp') || errorMessage.includes('instance')) { message = 'WhatsApp não configurado ou desconectado.'; errorCode = 'WHATSAPP_ERROR'; }
    return apiError(message, errorCode, 500);
  }
}
