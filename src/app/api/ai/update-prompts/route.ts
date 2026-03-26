import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
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

    const supabase = createAdminClient();

    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('id, company_id, is_active')
      .eq('key', apiKey)
      .single();

    if (keyError || !keyData) {
      return unauthorizedResponse('Invalid API key');
    }

    if (!keyData.is_active) {
      return unauthorizedResponse('API key is inactive');
    }

    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

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

    let query = supabase
      .from('ai_configurations')
      .select('id, prompts')
      .eq('company_id', keyData.company_id);

    if (configuration_id) {
      query = query.eq('id', configuration_id);
    }

    const { data: configs, error: configError } = await query.limit(1).single();

    if (configError || !configs) {
      return notFoundResponse('AI configuration not found for this company');
    }

    const existingPrompts = (configs.prompts as Record<string, any>) || {};
    const mergedPrompts = { ...existingPrompts, ...prompts };

    const { data: updated, error: updateError } = await supabase
      .from('ai_configurations')
      .update({ prompts: mergedPrompts, updated_at: new Date().toISOString() })
      .eq('id', configs.id)
      .select('id, prompts, updated_at')
      .single();

    if (updateError) {
      return errorResponse('Failed to update prompts');
    }

    return jsonResponse({ success: true, configuration: updated });
  } catch (error) {
    console.error('[update-ai-prompts] Unexpected error:', error);
    return errorResponse('Internal server error');
  }
}
