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

    const configs = await prisma.aiConfiguration.findMany({
      where: { companyId: keyData.companyId },
      orderBy: { createdAt: 'desc' },
    });

    return jsonResponse({ configurations: configs || [] });
  } catch (error) {
    console.error('[get-ai-config] Unexpected error:', error);
    return errorResponse('Internal server error');
  }
}
