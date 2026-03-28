import { prisma } from '@/lib/db';
import type { WhatsAppInstance } from './types';
import { getUAZMessageId } from './database';

export async function sendToWhatsApp(
  instance: WhatsAppInstance,
  endpoint: string,
  payload: any,
  messageId: string
): Promise<{ success: boolean; error?: string }> {
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
        prisma.whatsappInstance.update({
          where: { id: instance.id },
          data: { status: 'disconnected', errorMessage: 'Authentication failed' },
        }).catch(() => {});
      }

      prisma.message.update({
        where: { id: messageId },
        data: {
          metadata: {
            whatsapp_error: `API error: ${response.status}`,
            failed_at: new Date().toISOString(),
          } as any,
        },
      }).catch(() => {});

      return {
        success: false,
        error: `WhatsApp API error: ${response.status}`,
      };
    }

    const responseData = await response.json();

    const uazMessageId = responseData.message_id || responseData.id || responseData.key?.id;
    console.log('[WhatsApp API] Success, UAZ ID:', uazMessageId);

    prisma.message.update({
      where: { id: messageId },
      data: {
        uazMessageId,
        readStatus: 'sent',
        metadata: {
          whatsapp_message_id: uazMessageId,
          whatsapp_status: responseData.status || 'sent',
          sent_via: 'uaz_api_direct',
          sent_successfully_at: new Date().toISOString(),
        } as any,
      },
    }).catch((e: any) => console.warn('[WhatsApp API] Metadata update failed:', e));

    return { success: true };

  } catch (error) {
    console.error('[WhatsApp API] Exception:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    prisma.message.update({
      where: { id: messageId },
      data: {
        metadata: {
          whatsapp_error: errorMessage,
          failed_at: new Date().toISOString(),
        } as any,
      },
    }).catch(() => {});

    return {
      success: false,
      error: errorMessage,
    };
  }
}
