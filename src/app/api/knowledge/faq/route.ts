import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'

const apiError = (message: string, errorCode: string, status: number) =>
  jsonResponse({ success: false, error: errorCode, message }, status);

const apiSuccess = (data: unknown, status = 200) =>
  jsonResponse({ success: true, data }, status);

async function authenticateFaqApiKey(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return { error: apiError('Chave de API não fornecida. Inclua o header x-api-key.', 'API_KEY_REQUIRED', 401) };

  const apiKeyData = await prisma.apiKey.findFirst({
    where: { key: apiKey },
    select: { id: true, companyId: true, isActive: true, expiresAt: true },
  });

  if (!apiKeyData) return { error: apiError('Chave de API inválida. Verifique suas credenciais.', 'INVALID_API_KEY', 401) };
  if (!apiKeyData.isActive) return { error: apiError('Chave de API inativa. Entre em contato com o administrador.', 'INACTIVE_API_KEY', 401) };
  if (apiKeyData.expiresAt && new Date(apiKeyData.expiresAt) < new Date()) return { error: apiError('Chave de API expirada. Gere uma nova chave.', 'EXPIRED_API_KEY', 401) };

  await prisma.apiKey.update({ where: { id: apiKeyData.id }, data: { lastUsedAt: new Date() } });
  return { companyId: apiKeyData.companyId };
}

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

// GET /api/knowledge/faq - List FAQs
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateFaqApiKey(req);
    if ('error' in auth) return auth.error;
    const { companyId } = auth;

    const { searchParams } = req.nextUrl;
    const category = searchParams.get('category');
    const active = searchParams.get('active');
    const search = searchParams.get('search');

    const whereClause: any = { companyId };
    if (category) whereClause.category = category;
    if (active !== null) whereClause.isActive = active === 'true';
    if (search) {
      const sanitized = search.replace(/[,.()\\'"%]/g, '');
      whereClause.OR = [
        { question: { contains: sanitized, mode: 'insensitive' } },
        { answer: { contains: sanitized, mode: 'insensitive' } },
      ];
    }

    const data = await prisma.companyFaq.findMany({
      where: whereClause,
      orderBy: { orderPosition: 'asc' },
    });

    return apiSuccess(data);
  } catch (error) {
    return handleApiErrorCors(error, 'Erro')
  }
}

// POST /api/knowledge/faq - Create FAQ (single or bulk)
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateFaqApiKey(req);
    if ('error' in auth) return auth.error;
    const { companyId } = auth;

    const body = await req.json();

    // Bulk creation: array or { faqs: [...] }
    let faqsArray: unknown[] | null = null;
    if (Array.isArray(body)) {
      faqsArray = body;
    } else if (body?.faqs && Array.isArray(body.faqs)) {
      faqsArray = body.faqs;
    }

    if (faqsArray) {
      if (faqsArray.length === 0) return apiError('O array de FAQs não pode estar vazio.', 'EMPTY_FAQS', 400);

      const invalidItems: string[] = [];
      faqsArray.forEach((faq, index) => {
        const f = faq as Record<string, unknown>;
        if (!f?.question || typeof f.question !== 'string' || f.question.trim() === '') {
          invalidItems.push(`faqs[${index}].question é obrigatório`);
        }
      });
      if (invalidItems.length > 0) return apiError(`Erros de validação: ${invalidItems.join(', ')}.`, 'VALIDATION_ERROR', 400);

      const maxOrderFaq = await prisma.companyFaq.findFirst({
        where: { companyId },
        select: { orderPosition: true },
        orderBy: { orderPosition: 'desc' },
      });
      let nextOrder = (maxOrderFaq?.orderPosition ?? -1) + 1;

      const faqsToInsert = faqsArray.map((faq) => {
        const f = faq as { question: string; answer?: string; category?: string; keywords?: string[] | string; is_active?: boolean };
        const keywordsValue = f.keywords ? (Array.isArray(f.keywords) ? f.keywords : [f.keywords]) : undefined;
        return {
          companyId,
          question: f.question.trim(),
          answer: f.answer || '',
          category: f.category ?? undefined,
          keywords: keywordsValue,
          isActive: f.is_active ?? true,
          orderPosition: nextOrder++,
        };
      });

      // Prisma createMany doesn't return records, so use a transaction
      const data = await prisma.$transaction(
        faqsToInsert.map(faq => prisma.companyFaq.create({ data: faq }))
      );

      return jsonResponse({ success: true, data, count: data.length }, 201);
    }

    // Single FAQ creation
    if (!body.question) return apiError('O campo question é obrigatório.', 'MISSING_QUESTION', 400);

    const maxOrderFaq = await prisma.companyFaq.findFirst({
      where: { companyId },
      select: { orderPosition: true },
      orderBy: { orderPosition: 'desc' },
    });
    const nextOrder = (maxOrderFaq?.orderPosition ?? -1) + 1;

    const keywordsValue = body.keywords ? (Array.isArray(body.keywords) ? body.keywords : [body.keywords]) : undefined;
    const data = await prisma.companyFaq.create({
      data: {
        companyId,
        question: body.question,
        answer: body.answer || '',
        category: body.category ?? undefined,
        keywords: keywordsValue,
        isActive: body.is_active ?? true,
        orderPosition: nextOrder,
      },
    });

    return jsonResponse({ success: true, data }, 201);
  } catch (error) {
    return handleApiErrorCors(error, 'Erro')
  }
}
