import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';

const apiError = (message: string, errorCode: string, status: number) =>
  jsonResponse({ success: false, error: errorCode, message }, status);

const apiSuccess = (data: unknown, status = 200) =>
  jsonResponse({ success: true, data }, status);

async function authenticateFaqApiKey(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return { error: apiError('Chave de API não fornecida.', 'API_KEY_REQUIRED', 401) };

  const apiKeyData = await prisma.apiKey.findFirst({
    where: { key: apiKey },
    select: { id: true, companyId: true, isActive: true, expiresAt: true },
  });
  if (!apiKeyData) return { error: apiError('Chave de API inválida.', 'INVALID_API_KEY', 401) };
  if (!apiKeyData.isActive) return { error: apiError('Chave de API inativa.', 'INACTIVE_API_KEY', 401) };
  if (apiKeyData.expiresAt && new Date(apiKeyData.expiresAt) < new Date()) return { error: apiError('Chave de API expirada.', 'EXPIRED_API_KEY', 401) };

  await prisma.apiKey.update({ where: { id: apiKeyData.id }, data: { lastUsedAt: new Date() } });
  return { companyId: apiKeyData.companyId };
}

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

// GET /api/knowledge/faq/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateFaqApiKey(req);
    if ('error' in auth) return auth.error;
    const { companyId } = auth;
    const { id } = await params;

    const data = await prisma.companyFaq.findFirst({
      where: { id, companyId },
    });
    if (!data) return apiError('Pergunta frequente não encontrada.', 'FAQ_NOT_FOUND', 404);
    return apiSuccess(data);
  } catch (error) {
    console.error('Erro:', error);
    return errorResponse('Erro interno do servidor');
  }
}

// PATCH /api/knowledge/faq/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateFaqApiKey(req);
    if ('error' in auth) return auth.error;
    const { companyId } = auth;
    const { id } = await params;

    const existing = await prisma.companyFaq.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) return apiError('Pergunta frequente não encontrada.', 'FAQ_NOT_FOUND', 404);

    const body = await req.json();
    const updateData: Record<string, unknown> = {};
    if (body.question !== undefined) updateData.question = body.question;
    if (body.answer !== undefined) updateData.answer = body.answer;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.keywords !== undefined) updateData.keywords = body.keywords;
    if (body.is_active !== undefined) updateData.isActive = body.is_active;
    if (body.order_position !== undefined) updateData.orderPosition = body.order_position;

    if (Object.keys(updateData).length === 0) return apiError('Nenhum campo para atualizar.', 'NO_UPDATE_DATA', 400);

    const data = await prisma.companyFaq.update({
      where: { id },
      data: updateData,
    });
    return apiSuccess(data);
  } catch (error) {
    console.error('Erro:', error);
    return errorResponse('Erro interno do servidor');
  }
}

// DELETE /api/knowledge/faq/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateFaqApiKey(req);
    if ('error' in auth) return auth.error;
    const { companyId } = auth;
    const { id } = await params;

    const existing = await prisma.companyFaq.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) return apiError('Pergunta frequente não encontrada.', 'FAQ_NOT_FOUND', 404);

    await prisma.companyFaq.delete({ where: { id } });
    return apiSuccess({ message: 'Pergunta frequente excluída com sucesso.' });
  } catch (error) {
    console.error('Erro:', error);
    return errorResponse('Erro interno do servidor');
  }
}
