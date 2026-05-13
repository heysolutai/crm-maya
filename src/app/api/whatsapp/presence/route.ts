import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    await authenticate(req);

    const { conversationId, presence = 'composing', delay = 30000 } = await req.json();
    if (!conversationId) return jsonResponse({ success: false, error: 'conversationId is required' }, 400);

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { clientId: true, companyId: true },
    });
    if (!conversation) return jsonResponse({ success: false, error: 'Conversation not found' }, 404);

    if (!conversation.clientId) return jsonResponse({ success: false, error: 'Client not found for conversation' }, 404);

    const client = await prisma.client.findUnique({
      where: { id: conversation.clientId },
      select: { phone: true },
    });
    if (!client?.phone) return jsonResponse({ success: false, error: 'Client phone not found' }, 404);

    const cleanPhone = (client.phone ?? '').replace(/[^0-9]/g, '');

    const instance = await prisma.inbox.findFirst({
      where: { companyId: conversation.companyId || '', isActive: true },
      select: { apiUrl: true, instanceApiKey: true },
    });

    if (!instance) return jsonResponse({ success: false, error: 'WhatsApp instance not found' }, 404);

    const presenceResponse = await fetch(`${instance.apiUrl}/message/presence`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'token': instance.instanceApiKey || '' },
      body: JSON.stringify({ number: cleanPhone, presence, delay }),
    });

    if (!presenceResponse.ok) {
      const responseText = await presenceResponse.text();
      return jsonResponse({ success: false, error: `UAZAPI error: ${presenceResponse.status}`, details: responseText }, 502);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiErrorCors(error, '[whatsapp-presence] Error')
  }
}
