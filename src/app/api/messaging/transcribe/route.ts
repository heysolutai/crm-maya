import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, unauthorizedResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    let authResult;
    try {
      authResult = await authenticate(req);
    } catch {
      return unauthorizedResponse('Authentication required');
    }

    const { messageId } = await req.json();
    if (!messageId) return jsonResponse({ error: 'messageId is required' }, 400);

    const supabase = createAdminClient();

    const { data: message, error: msgError } = await supabase
      .from('messages')
      .select('id, uaz_message_id, message_text, metadata, conversation_id, conversations!inner (company_id)')
      .eq('id', messageId)
      .single();

    if (msgError || !message) throw new Error('Message not found');

    const messageCompanyId = (message.conversations as any).company_id;
    if (messageCompanyId !== authResult.companyId) {
      return jsonResponse({ error: 'Forbidden: message does not belong to your company' }, 403);
    }

    if (!message.uaz_message_id) throw new Error('Message does not have UAZ message ID');

    // Return cached transcription if available
    if (message.message_text && message.message_text !== '[Áudio]' && message.message_text !== '[Media]') {
      return jsonResponse({ success: true, transcription: message.message_text, cached: true });
    }

    const companyId = (message.conversations as any).company_id;

    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('instance_api_key, api_url')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single();

    if (!instance) throw new Error('Active WhatsApp instance not found');

    const { data: aiConfig } = await supabase
      .from('ai_configurations')
      .select('api_keys')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .maybeSingle();

    const openAiKey = (aiConfig?.api_keys as any)?.openai;
    if (!openAiKey) throw new Error('OpenAI API key not configured for this company');

    console.log('[Transcription] Calling UAZapi for message:', message.uaz_message_id);

    const response = await fetch(`${instance.api_url}/message/download`, {
      method: 'POST',
      headers: { 'token': instance.instance_api_key, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ id: message.uaz_message_id, return_base64: false, generate_mp3: false, return_link: false, transcribe: true, openai_apikey: openAiKey, download_quoted: false }),
    });

    if (!response.ok) throw new Error(`UAZapi error: ${response.status}`);

    const data = await response.json();
    const transcription = data.transcription || data.text;
    if (!transcription) throw new Error('No transcription returned from UAZapi');

    console.log('[Transcription] Success:', transcription.substring(0, 100));

    await supabase.from('messages').update({
      message_text: transcription,
      metadata: { ...(message.metadata as any || {}), transcribed: true, transcription_source: 'uazapi_openai', transcribed_at: new Date().toISOString() },
    }).eq('id', messageId);

    return jsonResponse({ success: true, transcription, cached: false });
  } catch (error) {
    console.error('[Transcription] Error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Internal server error' }, 500);
  }
}
