import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { sendToWhatsApp } from '@/lib/api/whatsapp';
import { handleCors, jsonResponse, errorResponse, unauthorizedResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    let authResult;
    try {
      authResult = await authenticate(req);
    } catch {
      return unauthorizedResponse('Authentication required');
    }

    const { conversationId, messageText } = await req.json();
    if (!conversationId || !messageText) return jsonResponse({ error: 'Missing conversationId or messageText' }, 400);

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        companyId: true,
        clientId: true,
        client: { select: { phone: true, firstName: true } },
      },
    });

    if (!conversation) throw new Error('Conversation not found');

    if (conversation.companyId !== authResult.companyId) {
      return jsonResponse({ error: 'Forbidden: conversation does not belong to your company' }, 403);
    }

    const client = conversation.client;

    if (!client) throw new Error('Client not found for this conversation');

    const instance = await prisma.whatsappInstance.findFirst({
      where: { companyId: conversation.companyId, isActive: true },
      select: { id: true, companyId: true, instanceName: true, apiUrl: true, instanceApiKey: true, isActive: true },
    });

    if (!instance) throw new Error('WhatsApp instance not found or inactive');

    const agentId = authResult.agentId;

    // Agent signature
    let finalMessageText = messageText;
    if (agentId) {
      const userData = await prisma.user.findUnique({
        where: { id: agentId },
        select: { fullName: true, settings: true },
      });
      if (userData) {
        const settings = userData.settings as any;
        const signature = settings?.permissions?.message_signature || userData.fullName || '';
        if (signature) finalMessageText = `${messageText}\n\n_${signature}_`;
      }
    }

    const message = await prisma.message.create({
      data: {
        conversationId, senderType: 'agent', senderId: agentId, messageText: finalMessageText, messageType: 'text',
      },
    });

    const { success, error: whatsappError } = await sendToWhatsApp(instance as any, '/send/text', { phone: client.phone, text: messageText }, message.id);
    if (!success) console.error('Failed to send WhatsApp message:', whatsappError);

    // Optional external webhook
    const webhookUrl = process.env.EXTERNAL_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: messageText, phone: client.phone, instance_name: instance.instanceName, instance_id: instance.instanceName, client_name: client.firstName, timestamp: new Date().toISOString() }),
        });
      } catch (e) { console.error('Webhook failed:', e); }
    }

    return jsonResponse({ success: true, message_id: message.id, webhook_sent: !!webhookUrl });
  } catch (error) {
    console.error('Error in send-agent-message:', error);
    return errorResponse('Erro interno do servidor');
  }
}
