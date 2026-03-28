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

    const config = await prisma.aiConfiguration.findFirst({
      where: { companyId: keyData.companyId },
      select: { apiKeys: true },
      orderBy: { createdAt: 'desc' },
    });

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
