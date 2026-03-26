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

    const { data: config, error: configError } = await supabase
      .from('ai_configurations')
      .select('api_keys')
      .eq('company_id', keyData.company_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (configError) {
      console.error('[get-audio-settings] Error fetching config:', configError.message);
      return errorResponse('Failed to fetch audio settings');
    }

    if (!config) {
      return jsonResponse({
        voice_id: null,
        stability: 0.5,
        similarity: 0.75,
        style: 0,
        speaker_boost: true,
        remove_background_noise: false,
      });
    }

    const apiKeysConfig = (config as any).api_keys || {};

    return jsonResponse({
      voice_id: apiKeysConfig.elevenlabs_voice_id || null,
      stability: apiKeysConfig.elevenlabs_stability ?? 0.5,
      similarity: apiKeysConfig.elevenlabs_similarity ?? 0.75,
      style: apiKeysConfig.elevenlabs_style ?? 0,
      speaker_boost: apiKeysConfig.elevenlabs_speaker_boost ?? true,
      remove_background_noise: apiKeysConfig.elevenlabs_remove_background_noise ?? false,
    });
  } catch (error) {
    console.error('[get-audio-settings] Unexpected error:', error);
    return errorResponse('Internal server error');
  }
}
