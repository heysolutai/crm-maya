import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/api/auth';
import { sendToWhatsApp } from '@/lib/api/whatsapp';
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

    const { conversationId, messageText } = await req.json();
    if (!conversationId || !messageText) return jsonResponse({ error: 'Missing conversationId or messageText' }, 400);

    const supabase = createAdminClient();

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, company_id, client_id, clients!inner (phone, first_name), companies (whatsapp_instance_name)')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) throw new Error('Conversation not found');

    if (conversation.company_id !== authResult.companyId) {
      return jsonResponse({ error: 'Forbidden: conversation does not belong to your company' }, 403);
    }

    const client = Array.isArray(conversation.clients) ? conversation.clients[0] : conversation.clients;

    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('id, company_id, instance_name, api_url, instance_api_key, is_active')
      .eq('company_id', conversation.company_id)
      .eq('is_active', true)
      .single();

    if (!instance) throw new Error('WhatsApp instance not found or inactive');

    const agentId = authResult.agentId;

    // Agent signature
    let finalMessageText = messageText;
    if (agentId) {
      const { data: userData } = await supabase.from('users').select('full_name, settings').eq('id', agentId).single();
      if (userData) {
        const settings = userData.settings as any;
        const signature = settings?.permissions?.message_signature || userData.full_name || '';
        if (signature) finalMessageText = `${messageText}\n\n_${signature}_`;
      }
    }

    const { data: message, error: msgError } = await supabase.from('messages').insert({
      conversation_id: conversationId, sender_type: 'agent', sender_id: agentId, message_text: finalMessageText, message_type: 'text',
    }).select().single();

    if (msgError) throw new Error('Failed to save message');

    const { success, error: whatsappError } = await sendToWhatsApp(instance, '/send/text', { phone: client.phone, text: messageText }, message.id);
    if (!success) console.error('Failed to send WhatsApp message:', whatsappError);

    // Optional external webhook
    const webhookUrl = process.env.EXTERNAL_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: messageText, phone: client.phone, instance_name: instance.instance_name, instance_id: instance.instance_name, client_name: client.first_name, timestamp: new Date().toISOString() }),
        });
      } catch (e) { console.error('Webhook failed:', e); }
    }

    return jsonResponse({ success: true, message_id: message.id, webhook_sent: !!webhookUrl });
  } catch (error) {
    console.error('Error in send-agent-message:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error');
  }
}
