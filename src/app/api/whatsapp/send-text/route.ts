import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { getWhatsAppInstance, findOrCreateConversation, saveMessage, getUAZMessageId, getClientPhoneByConversationId } from '@/lib/api/database';
import { sendToWhatsApp } from '@/lib/api/whatsapp';
import { validateTextPayload } from '@/lib/api/utils';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'
import { getAdapter, hasAdapter } from '@/lib/channels/registry';
import { isChannelType } from '@/lib/channels/types';

const apiError = (message: string, errorCode: string, status: number, extra?: Record<string, unknown>) =>
  jsonResponse({ success: false, error: errorCode, message, ...extra }, status);

const sendTextSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1, 'Message is required'),
  phone: z.string().optional(),
  fromAI: z.boolean().optional(),
  replyToMessageId: z.string().uuid().optional(),
  replyid: z.string().optional(),
  linkPreview: z.boolean().optional(),
  linkPreviewTitle: z.string().optional(),
  linkPreviewDescription: z.string().optional(),
  linkPreviewImage: z.string().optional(),
  linkPreviewLarge: z.boolean().optional(),
  mentions: z.any().optional(),
  readchat: z.boolean().optional(),
  readmessages: z.boolean().optional(),
  delay: z.number().optional(),
  forward: z.boolean().optional(),
  track_source: z.string().optional(),
  track_id: z.string().optional(),
});

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const t0 = Date.now();
    console.log('[send-message-text] Processing request...');

    const body = await req.json();
    const validation = sendTextSchema.safeParse(body);

    if (!validation.success) {
      return apiError('Dados inválidos', 'INVALID_PAYLOAD', 400, { details: validation.error.flatten().fieldErrors });
    }

    const payload = validation.data;

    // Fetch phone from conversation if not provided
    let phone = payload.phone;
    if (!phone && payload.conversationId) {
      const fetchedPhone = await getClientPhoneByConversationId(payload.conversationId);
      if (!fetchedPhone) return apiError('Não foi possível encontrar o telefone do cliente para esta conversa.', 'CLIENT_PHONE_NOT_FOUND', 404);
      phone = fetchedPhone;
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

    if (!companyId) return apiError('Empresa não identificada.', 'COMPANY_NOT_FOUND', 400);

    console.log('[send-message-text] Auth done:', Date.now() - t0, 'ms');

    // Resolve a conversa antes pra descobrir qual agente envia (multi-canal).
    const conversationId = payload.conversationId
      ? payload.conversationId
      : await findOrCreateConversation(payload.phone || '', companyId);

    // Busca a conversa pra saber qual agente esta vinculado
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, companyId },
      select: { id: true, inboxId: true },
    });
    if (!conversation) return apiError('Conversa não encontrada.', 'CONVERSATION_NOT_FOUND', 404);

    // Se a conversa tem inbox vinculada e ela tem adapter, manda pelo adapter
    if (conversation.inboxId) {
      const agent = await prisma.inbox.findFirst({
        where: { id: conversation.inboxId, companyId },
      });

      if (agent && isChannelType(agent.channelType) && hasAdapter(agent.channelType as any)) {
        const message = await saveMessage(conversationId, payload.message, 'text', payload.fromAI || false, agentId, undefined, { adapter_payload: payload, channel: agent.channelType });

        try {
          const adapter = getAdapter(agent.channelType as any);
          const result = await adapter.sendText(
            {
              id: agent.id,
              companyId: agent.companyId,
              channelType: agent.channelType as any,
              instanceName: agent.instanceName,
              displayName: agent.displayName,
              phoneNumber: agent.phoneNumber,
              apiUrl: agent.apiUrl,
              instanceApiKey: agent.instanceApiKey,
              channelConfig: agent.channelConfig as any,
              metadata: agent.metadata as any,
            },
            {
              to: payload.phone || '',
              text: payload.message,
              quotedMessageId: replyid || payload.replyid,
            }
          );

          // Grava o ID do provider pra dedup do webhook de eco
          if (result.providerMessageId) {
            await prisma.message.update({
              where: { id: message.id },
              data: { uazMessageId: result.providerMessageId },
            }).catch(() => {});
          }

          console.log('[send-message-text] adapter send done:', Date.now() - t0, 'ms');
          return jsonResponse({
            success: true,
            message_id: message.id,
            conversation_id: conversationId,
            sender_type: payload.fromAI ? 'ai' : 'agent',
            channel: agent.channelType,
          });
        } catch (sendErr: any) {
          await prisma.message.update({
            where: { id: message.id },
            data: { metadata: { send_error: sendErr?.message || 'unknown', failed_at: new Date().toISOString() } as any },
          }).catch(() => {});
          return apiError(sendErr?.message || 'Falha ao enviar pelo agente.', 'ADAPTER_SEND_FAILED', 502, { message_id: message.id });
        }
      }
    }

    // Fallback: fluxo legado UazAPI (instancia unica por empresa, sem channel adapter)
    const instance = await getWhatsAppInstance(companyId).catch(() => null);
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
    return handleApiErrorCors(error, '[send-message-text] Error')
  }
}
