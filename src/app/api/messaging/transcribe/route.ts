import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
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

    const { messageId } = await req.json();
    if (!messageId) return jsonResponse({ error: 'messageId is required' }, 400);

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        uazMessageId: true,
        messageText: true,
        metadata: true,
        conversationId: true,
        conversation: { select: { companyId: true } },
      },
    });

    if (!message) throw new Error('Message not found');

    const messageCompanyId = message.conversation.companyId;
    if (messageCompanyId !== authResult.companyId) {
      return jsonResponse({ error: 'Forbidden: message does not belong to your company' }, 403);
    }

    if (!message.uazMessageId) throw new Error('Message does not have UAZ message ID');

    // Return cached transcription if available
    if (message.messageText && message.messageText !== '[Áudio]' && message.messageText !== '[Media]') {
      return jsonResponse({ success: true, transcription: message.messageText, cached: true });
    }

    const companyId = message.conversation.companyId;

    const instance = await prisma.whatsappInstance.findFirst({
      where: { companyId, isActive: true },
      select: { instanceApiKey: true, apiUrl: true },
    });

    if (!instance) throw new Error('Active WhatsApp instance not found');

    const aiConfig = await prisma.aiConfiguration.findFirst({
      where: { companyId, isActive: true },
      select: { apiKeys: true },
    });

    const openAiKey = (aiConfig?.apiKeys as any)?.openai;
    if (!openAiKey) throw new Error('OpenAI API key not configured for this company');

    console.log('[Transcription] Calling UAZapi for message:', message.uazMessageId);

    const response = await fetch(`${instance.apiUrl}/message/download`, {
      method: 'POST',
      headers: { 'token': instance.instanceApiKey ?? '', 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ id: message.uazMessageId, return_base64: false, generate_mp3: false, return_link: false, transcribe: true, openai_apikey: openAiKey, download_quoted: false }),
    });

    if (!response.ok) throw new Error(`UAZapi error: ${response.status}`);

    const data = await response.json();
    const transcription = data.transcription || data.text;
    if (!transcription) throw new Error('No transcription returned from UAZapi');

    console.log('[Transcription] Success:', transcription.substring(0, 100));

    await prisma.message.update({
      where: { id: messageId },
      data: {
        messageText: transcription,
        metadata: { ...(message.metadata as any || {}), transcribed: true, transcription_source: 'uazapi_openai', transcribed_at: new Date().toISOString() },
      },
    });

    return jsonResponse({ success: true, transcription, cached: false });
  } catch (error) {
    console.error('[Transcription] Error:', error);
    return jsonResponse({ error: 'Erro interno do servidor' }, 500);
  }
}
