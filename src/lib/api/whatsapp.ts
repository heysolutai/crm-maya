import { createAdminClient } from '@/lib/supabase/admin';
import type { WhatsAppInstance } from './types';
import { getUAZMessageId } from './database';

export async function sendToWhatsApp(
  instance: WhatsAppInstance,
  endpoint: string,
  payload: any,
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();
  const rawPhone = payload.phone ?? payload.number;
  if (!rawPhone) {
    throw new Error('phone or number is required');
  }
  const cleanPhone = rawPhone.replace(/[^0-9]/g, '');

  try {
    if (payload.replyToMessageId) {
      const uazMessageId = await getUAZMessageId(payload.replyToMessageId);
      if (uazMessageId) {
        payload.replyid = uazMessageId;
        console.log(`[WhatsApp] Reply to message: ${uazMessageId}`);
      }
      delete payload.replyToMessageId;
    }

    const url = `${instance.api_url}${endpoint}`;
    console.log('[WhatsApp API] Calling:', url, '| Phone:', cleanPhone);

    const { phone, number, fromAI, conversationId, company_id, ...rest } = payload;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': instance.instance_api_key,
      },
      body: JSON.stringify({
        ...rest,
        number: cleanPhone,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[WhatsApp API] Error:', response.status, errorText);

      if (response.status === 401 || response.status === 403) {
        Promise.resolve(
          supabase
            .from('whatsapp_instances')
            .update({ status: 'disconnected' as any, error_message: 'Authentication failed' })
            .eq('id', instance.id)
        ).catch(() => {});
      }

      Promise.resolve(
        supabase
          .from('messages')
          .update({
            metadata: {
              whatsapp_error: `API error: ${response.status}`,
              failed_at: new Date().toISOString(),
            } as any
          })
          .eq('id', messageId)
      ).catch(() => {});

      return {
        success: false,
        error: `WhatsApp API error: ${response.status}`,
      };
    }

    const responseData = await response.json();

    const uazMessageId = responseData.message_id || responseData.id || responseData.key?.id;
    console.log('[WhatsApp API] Success, UAZ ID:', uazMessageId);

    Promise.resolve(
      supabase
        .from('messages')
        .update({
          uaz_message_id: uazMessageId,
          read_status: 'sent' as any,
          metadata: {
            whatsapp_message_id: uazMessageId,
            whatsapp_status: responseData.status || 'sent',
            sent_via: 'uaz_api_direct',
            sent_successfully_at: new Date().toISOString(),
          } as any
        })
        .eq('id', messageId)
    ).catch((e: any) => console.warn('[WhatsApp API] Metadata update failed:', e));

    return { success: true };

  } catch (error) {
    console.error('[WhatsApp API] Exception:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    Promise.resolve(
      supabase
        .from('messages')
        .update({
          metadata: {
            whatsapp_error: errorMessage,
            failed_at: new Date().toISOString(),
          } as any
        })
        .eq('id', messageId)
    ).catch(() => {});

    return {
      success: false,
      error: errorMessage,
    };
  }
}
