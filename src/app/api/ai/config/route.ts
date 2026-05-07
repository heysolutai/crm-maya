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

    // Filtros opcionais: agentId (whatsappInstanceId) e conversationId
    // (resolve o agente automaticamente). Quando nenhum e passado, retorna
    // todas as configs da empresa (back-compat com clientes externos antigos).
    const agentId = req.nextUrl.searchParams.get('agentId')
    const conversationId = req.nextUrl.searchParams.get('conversationId')

    let resolvedAgentId: string | null = agentId

    if (!resolvedAgentId && conversationId) {
      const conv = await prisma.conversation.findFirst({
        where: { id: conversationId, companyId: keyData.companyId },
        select: { whatsappInstanceId: true },
      })
      resolvedAgentId = conv?.whatsappInstanceId || null
    }

    const where: any = { companyId: keyData.companyId }
    if (resolvedAgentId) where.whatsappInstanceId = resolvedAgentId

    const configs = await prisma.aiConfiguration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return jsonResponse({ configurations: configs || [] });
  } catch (error) {
    console.error('[get-ai-config] Unexpected error:', error);
    return errorResponse('Internal server error');
  }
}
