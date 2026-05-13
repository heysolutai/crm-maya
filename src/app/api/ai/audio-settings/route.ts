import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { handleCors, jsonResponse, errorResponse, unauthorizedResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

export async function GET(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return unauthorizedResponse('API key is required');
    }

    const keyData = await prisma.apiKey.findFirst({
      where: { key: apiKey },
      select: { id: true, companyId: true, isActive: true },
    });

    if (!keyData) {
      return unauthorizedResponse('Invalid API key');
    }

    if (!keyData.isActive) {
      return unauthorizedResponse('API key is inactive');
    }

    await prisma.apiKey.update({
      where: { id: keyData.id },
      data: { lastUsedAt: new Date() },
    });

    // Filtros opcionais: agentId direto ou conversationId (resolve agente)
    const agentId = req.nextUrl.searchParams.get('agentId')
    const conversationId = req.nextUrl.searchParams.get('conversationId')

    let resolvedInboxId: string | null = agentId
    if (!resolvedInboxId && conversationId) {
      const conv = await prisma.conversation.findFirst({
        where: { id: conversationId, companyId: keyData.companyId },
        select: { inboxId: true },
      })
      resolvedInboxId = conv?.inboxId || null
    }

    let config: { apiKeys: any } | null = null
    if (resolvedInboxId) {
      const inbox = await prisma.inbox.findFirst({
        where: { id: resolvedInboxId, companyId: keyData.companyId },
        include: { aiAgent: { select: { apiKeys: true } } },
      })
      config = inbox?.aiAgent ?? null
    } else {
      config = await prisma.aiAgent.findFirst({
        where: { companyId: keyData.companyId },
        select: { apiKeys: true },
        orderBy: { createdAt: 'desc' },
      })
    }

    if (!config) {
      return jsonResponse({
        voice_id: null,
        stability: 0.5,
        similarity: 0.75,
        style: 0,
        speaker_boost: true,
        remove_background_noise: false,
      });
    }

    const apiKeysConfig = (config as any).apiKeys || {};

    return jsonResponse({
      voice_id: apiKeysConfig.elevenlabs_voice_id || null,
      stability: apiKeysConfig.elevenlabs_stability ?? 0.5,
      similarity: apiKeysConfig.elevenlabs_similarity ?? 0.75,
      style: apiKeysConfig.elevenlabs_style ?? 0,
      speaker_boost: apiKeysConfig.elevenlabs_speaker_boost ?? true,
      remove_background_noise: apiKeysConfig.elevenlabs_remove_background_noise ?? false,
    });
  } catch (error) {
    console.error('[get-audio-settings] Unexpected error:', error);
    return errorResponse('Internal server error');
  }
}
