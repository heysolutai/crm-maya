import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';

const apiError = (message: string, errorCode: string, status: number) =>
  jsonResponse({ success: false, error: errorCode, message }, status);

const apiSuccess = (data: unknown, status = 200) =>
  jsonResponse({ success: true, data }, status);

async function authenticateFaqApiKey(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return { error: apiError('Chave de API não fornecida. Inclua o header x-api-key.', 'API_KEY_REQUIRED', 401) };

  const supabase = createAdminClient();
  const { data: apiKeyData, error: apiKeyError } = await supabase
    .from('api_keys')
    .select('id, company_id, is_active, expires_at')
    .eq('key', apiKey)
    .single();

  if (apiKeyError || !apiKeyData) return { error: apiError('Chave de API inválida. Verifique suas credenciais.', 'INVALID_API_KEY', 401) };
  if (!apiKeyData.is_active) return { error: apiError('Chave de API inativa. Entre em contato com o administrador.', 'INACTIVE_API_KEY', 401) };
  if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) return { error: apiError('Chave de API expirada. Gere uma nova chave.', 'EXPIRED_API_KEY', 401) };

  await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', apiKeyData.id);
  return { companyId: apiKeyData.company_id, supabase };
}

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

// GET /api/knowledge/faq - List FAQs
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateFaqApiKey(req);
    if ('error' in auth) return auth.error;
    const { companyId, supabase } = auth;

    const { searchParams } = req.nextUrl;
    const category = searchParams.get('category');
    const active = searchParams.get('active');
    const search = searchParams.get('search');

    let query = supabase.from('company_faqs').select('*').eq('company_id', companyId).order('order_position', { ascending: true });
    if (category) query = query.eq('category', category);
    if (active !== null) query = query.eq('is_active', active === 'true');
    if (search) {
      const sanitized = search.replace(/[,.()\\'"%]/g, '');
      query = query.or(`question.ilike.%${sanitized}%,answer.ilike.%${sanitized}%`);
    }

    const { data, error } = await query;
    if (error) return apiError('Erro ao listar perguntas frequentes. Tente novamente.', 'FETCH_FAQS_ERROR', 500);
    return apiSuccess(data);
  } catch (error: any) {
    return errorResponse(error.message);
  }
}

// POST /api/knowledge/faq - Create FAQ (single or bulk)
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateFaqApiKey(req);
    if ('error' in auth) return auth.error;
    const { companyId, supabase } = auth;

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

      const { data: maxOrderData } = await supabase.from('company_faqs').select('order_position').eq('company_id', companyId).order('order_position', { ascending: false }).limit(1).single();
      let nextOrder = (maxOrderData?.order_position ?? -1) + 1;

      const faqsToInsert = faqsArray.map((faq) => {
        const f = faq as { question: string; answer?: string; category?: string; keywords?: string[]; is_active?: boolean };
        return { company_id: companyId, question: f.question.trim(), answer: f.answer || '', category: f.category || null, keywords: f.keywords || null, is_active: f.is_active ?? true, order_position: nextOrder++ };
      });

      const { data, error } = await supabase.from('company_faqs').insert(faqsToInsert).select();
      if (error) return apiError('Erro ao criar FAQs em lote. Tente novamente.', 'BULK_CREATE_ERROR', 500);
      return jsonResponse({ success: true, data, count: data.length }, 201);
    }

    // Single FAQ creation
    if (!body.question) return apiError('O campo question é obrigatório.', 'MISSING_QUESTION', 400);

    const { data: maxOrderData } = await supabase.from('company_faqs').select('order_position').eq('company_id', companyId).order('order_position', { ascending: false }).limit(1).single();
    const nextOrder = (maxOrderData?.order_position ?? -1) + 1;

    const { data, error } = await supabase.from('company_faqs').insert({
      company_id: companyId, question: body.question, answer: body.answer || '', category: body.category || null, keywords: body.keywords || null, is_active: body.is_active ?? true, order_position: nextOrder,
    }).select().single();

    if (error) return apiError('Erro ao criar pergunta frequente. Tente novamente.', 'CREATE_FAQ_ERROR', 500);
    return jsonResponse({ success: true, data }, 201);
  } catch (error: any) {
    return errorResponse(error.message);
  }
}
