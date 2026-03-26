import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';

const apiError = (message: string, errorCode: string, status: number) =>
  jsonResponse({ success: false, error: errorCode, message }, status);

const apiSuccess = (data: unknown, status = 200) =>
  jsonResponse({ success: true, data }, status);

async function authenticateFaqApiKey(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return { error: apiError('Chave de API não fornecida.', 'API_KEY_REQUIRED', 401) };

  const supabase = createAdminClient();
  const { data: apiKeyData, error: apiKeyError } = await supabase.from('api_keys').select('id, company_id, is_active, expires_at').eq('key', apiKey).single();
  if (apiKeyError || !apiKeyData) return { error: apiError('Chave de API inválida.', 'INVALID_API_KEY', 401) };
  if (!apiKeyData.is_active) return { error: apiError('Chave de API inativa.', 'INACTIVE_API_KEY', 401) };
  if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) return { error: apiError('Chave de API expirada.', 'EXPIRED_API_KEY', 401) };

  await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', apiKeyData.id);
  return { companyId: apiKeyData.company_id, supabase };
}

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

// GET /api/knowledge/faq/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateFaqApiKey(req);
    if ('error' in auth) return auth.error;
    const { companyId, supabase } = auth;
    const { id } = await params;

    const { data, error } = await supabase.from('company_faqs').select('*').eq('id', id).eq('company_id', companyId).single();
    if (error) {
      if (error.code === 'PGRST116') return apiError('Pergunta frequente não encontrada.', 'FAQ_NOT_FOUND', 404);
      return apiError('Erro ao buscar pergunta frequente.', 'FETCH_FAQ_ERROR', 500);
    }
    return apiSuccess(data);
  } catch (error: any) {
    return errorResponse(error.message);
  }
}

// PATCH /api/knowledge/faq/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateFaqApiKey(req);
    if ('error' in auth) return auth.error;
    const { companyId, supabase } = auth;
    const { id } = await params;

    const { data: existing, error: existingError } = await supabase.from('company_faqs').select('id').eq('id', id).eq('company_id', companyId).single();
    if (existingError || !existing) return apiError('Pergunta frequente não encontrada.', 'FAQ_NOT_FOUND', 404);

    const body = await req.json();
    const updateData: Record<string, unknown> = {};
    if (body.question !== undefined) updateData.question = body.question;
    if (body.answer !== undefined) updateData.answer = body.answer;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.keywords !== undefined) updateData.keywords = body.keywords;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.order_position !== undefined) updateData.order_position = body.order_position;

    if (Object.keys(updateData).length === 0) return apiError('Nenhum campo para atualizar.', 'NO_UPDATE_DATA', 400);

    const { data, error } = await supabase.from('company_faqs').update(updateData).eq('id', id).select().single();
    if (error) return apiError('Erro ao atualizar pergunta frequente.', 'UPDATE_FAQ_ERROR', 500);
    return apiSuccess(data);
  } catch (error: any) {
    return errorResponse(error.message);
  }
}

// DELETE /api/knowledge/faq/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateFaqApiKey(req);
    if ('error' in auth) return auth.error;
    const { companyId, supabase } = auth;
    const { id } = await params;

    const { data: existing, error: existingError } = await supabase.from('company_faqs').select('id').eq('id', id).eq('company_id', companyId).single();
    if (existingError || !existing) return apiError('Pergunta frequente não encontrada.', 'FAQ_NOT_FOUND', 404);

    const { error } = await supabase.from('company_faqs').delete().eq('id', id);
    if (error) return apiError('Erro ao excluir pergunta frequente.', 'DELETE_FAQ_ERROR', 500);
    return apiSuccess({ message: 'Pergunta frequente excluída com sucesso.' });
  } catch (error: any) {
    return errorResponse(error.message);
  }
}
