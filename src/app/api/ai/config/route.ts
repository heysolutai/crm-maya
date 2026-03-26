import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
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

    const { data: configs, error: configError } = await supabase
      .from('ai_configurations')
      .select('*')
      .eq('company_id', keyData.company_id)
      .order('created_at', { ascending: false });

    if (configError) {
      console.error('[get-ai-config] Error fetching configs:', configError.message);
      return errorResponse('Failed to fetch AI configurations');
    }

    return jsonResponse({ configurations: configs || [] });
  } catch (error) {
    console.error('[get-ai-config] Unexpected error:', error);
    return errorResponse('Internal server error');
  }
}
