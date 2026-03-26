import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();

    const { agentId } = await authenticate(req);

    const { messageId, emoji } = await req.json();
    if (!messageId) throw new Error('messageId is required');

    console.log('[send-reaction] User:', agentId || 'api-key', 'Message:', messageId, 'Emoji:', emoji);

    const { data: message, error: msgError } = await supabase
      .from('messages')
      .select('id, uaz_message_id, conversation_id, conversations(id, company_id, client_id, clients(phone))')
      .eq('id', messageId)
      .single();

    if (msgError || !message) throw new Error('Message not found');

    const phone = (message.conversations as any).clients.phone;
    const companyId = (message.conversations as any).company_id;
    const uazMessageId = message.uaz_message_id;

    if (!uazMessageId) throw new Error('Message does not have UAZ message ID');

    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single();

    if (instanceError || !instance) throw new Error('WhatsApp instance not found');

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const formattedNumber = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

    const response = await fetch(`${instance.api_url}/message/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': instance.instance_api_key },
      body: JSON.stringify({ number: formattedNumber, text: emoji || '', id: uazMessageId }),
    });

    if (!response.ok) throw new Error(`UAZapi error: ${response.status}`);

    // Save or remove reaction in DB (agentId is null when using API key)
    if (agentId) {
      if (emoji) {
        await supabase.from('message_reactions').upsert({ message_id: messageId, user_id: agentId, emoji }, { onConflict: 'message_id,user_id' });
      } else {
        await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', agentId);
      }
    }

    return jsonResponse({ success: true, message: 'Reaction sent successfully' });
  } catch (error: any) {
    console.error('[send-reaction] Error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}
