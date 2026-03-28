import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { handleCors, jsonResponse, errorResponse, unauthorizedResponse, badRequestResponse, notFoundResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { configuration_id, papel, objetivo, funcao, funil, regras, regras_horarios, boas_vindas } = body;

    const prompts: Record<string, string> = {};
    if (papel !== undefined) prompts.papel = papel;
    if (objetivo !== undefined) prompts.objetivo = objetivo;
    if (funcao !== undefined) prompts.funcao = funcao;
    if (funil !== undefined) prompts.funil = funil;
    if (regras !== undefined) prompts.regras = regras;
    if (regras_horarios !== undefined) prompts.regras_horarios = regras_horarios;
    if (boas_vindas !== undefined) prompts.boas_vindas = boas_vindas;

    if (Object.keys(prompts).length === 0) {
      return badRequestResponse('At least one prompt field is required');
    }

    const whereClause: any = { companyId: keyData.companyId };
    if (configuration_id) {
      whereClause.id = configuration_id;
    }

    const config = await prisma.aiConfiguration.findFirst({
      where: whereClause,
      select: { id: true, prompts: true },
    });

    if (!config) {
      return notFoundResponse('AI configuration not found for this company');
    }

    const existingPrompts = (config.prompts as Record<string, any>) || {};
    const mergedPrompts = { ...existingPrompts, ...prompts };

    const updated = await prisma.aiConfiguration.update({
      where: { id: config.id },
      data: { prompts: mergedPrompts, updatedAt: new Date() },
      select: { id: true, prompts: true, updatedAt: true },
    });

    return jsonResponse({ success: true, configuration: updated });
  } catch (error) {
    console.error('[update-ai-prompts] Unexpected error:', error);
    return errorResponse('Internal server error');
  }
}
