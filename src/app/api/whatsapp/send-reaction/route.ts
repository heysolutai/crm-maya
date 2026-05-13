import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'

const sendReactionSchema = z.object({
  messageId: z.string().uuid(),
  emoji: z.string().optional(),
});

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const { agentId } = await authenticate(req);

    const body = await req.json();
    const validation = sendReactionSchema.safeParse(body);

    if (!validation.success) {
      return jsonResponse({ success: false, error: 'Dados inválidos', details: validation.error.flatten().fieldErrors }, 400);
    }

    const { messageId, emoji } = validation.data;

    console.log('[send-reaction] User:', agentId || 'api-key', 'Message:', messageId, 'Emoji:', emoji);

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        uazMessageId: true,
        conversationId: true,
        conversation: {
          select: {
            id: true,
            companyId: true,
            clientId: true,
            client: { select: { phone: true } },
          },
        },
      },
    });

    if (!message) throw new Error('Message not found');

    if (!message.conversation.client) throw new Error('Client not found for this conversation');

    const phone = message.conversation.client.phone;
    const companyId = message.conversation.companyId;
    const uazMessageId = message.uazMessageId;

    if (!uazMessageId) throw new Error('Message does not have UAZ message ID');

    const instance = await prisma.inbox.findFirst({
      where: { companyId, isActive: true },
    });

    if (!instance) throw new Error('WhatsApp instance not found');

    const cleanPhone = phone!.replace(/[^0-9]/g, '');
    const formattedNumber = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

    const response = await fetch(`${instance.apiUrl}/message/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': instance.instanceApiKey || '' },
      body: JSON.stringify({ number: formattedNumber, text: emoji || '', id: uazMessageId }),
    });

    if (!response.ok) throw new Error(`UAZapi error: ${response.status}`);

    // Save or remove reaction in DB (agentId is null when using API key)
    if (agentId) {
      if (emoji) {
        const existing = await prisma.messageReaction.findFirst({
          where: { messageId, userId: agentId },
        });
        if (existing) {
          await prisma.messageReaction.update({ where: { id: existing.id }, data: { emoji } });
        } else {
          await prisma.messageReaction.create({ data: { messageId, userId: agentId, emoji } });
        }
      } else {
        await prisma.messageReaction.deleteMany({
          where: { messageId, userId: agentId },
        });
      }
    }

    return jsonResponse({ success: true, message: 'Reaction sent successfully' });
  } catch (error) {
    return handleApiErrorCors(error, '[send-reaction] Error')
  }
}
