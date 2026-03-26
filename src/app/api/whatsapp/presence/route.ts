import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();

    await authenticate(req);

    const { conversationId, presence = 'composing', delay = 30000 } = await req.json();
    if (!conversationId) return jsonResponse({ success: false, error: 'conversationId is required' }, 400);

    const { data: conversation, error: convError } = await supabase.from('conversations').select('client_id, company_id').eq('id', conversationId).single();
    if (convError || !conversation) return jsonResponse({ success: false, error: 'Conversation not found' }, 404);

    const { data: client, error: clientError } = await supabase.from('clients').select('phone').eq('id', conversation.client_id).single();
    if (clientError || !client?.phone) return jsonResponse({ success: false, error: 'Client phone not found' }, 404);

    const cleanPhone = client.phone.replace(/[^0-9]/g, '');

    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('api_url, instance_api_key')
      .eq('company_id', conversation.company_id)
      .eq('is_active', true)
      .single();

    if (instanceError || !instance) return jsonResponse({ success: false, error: 'WhatsApp instance not found' }, 404);

    const presenceResponse = await fetch(`${instance.api_url}/message/presence`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'token': instance.instance_api_key },
      body: JSON.stringify({ number: cleanPhone, presence, delay }),
    });

    if (!presenceResponse.ok) {
      const responseText = await presenceResponse.text();
      return jsonResponse({ success: false, error: `UAZAPI error: ${presenceResponse.status}`, details: responseText }, 502);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('[whatsapp-presence] Error:', error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, 500);
  }
}
