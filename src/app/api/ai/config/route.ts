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

    // Filtros opcionais: agentId (inboxId) e conversationId
    // (resolve a inbox automaticamente). Quando nenhum e passado, retorna
    // todas as configs da empresa (back-compat com clientes externos antigos).
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

    let configs: any[] = []
    if (resolvedInboxId) {
      // Busca o AiAgent vinculado a inbox (M:1 via Inbox.aiAgentId)
      const inbox = await prisma.inbox.findFirst({
        where: { id: resolvedInboxId, companyId: keyData.companyId },
        include: { aiAgent: true },
      })
      configs = inbox?.aiAgent ? [inbox.aiAgent] : []
    } else {
      configs = await prisma.aiAgent.findMany({
        where: { companyId: keyData.companyId },
        orderBy: { createdAt: 'desc' },
      })
    }

    return jsonResponse({ configurations: configs || [] });
  } catch (error) {
    console.error('[get-ai-config] Unexpected error:', error);
    return errorResponse('Internal server error');
  }
}
