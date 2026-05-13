import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse } from '@/lib/api/cors';
import { publishEvent } from '@/lib/realtime';
import { deleteMediaFromUrl } from '@/lib/storage';
import { z } from 'zod';
import { handleApiErrorCors } from '@/lib/api/errors'

const schema = z.object({
  messageId: z.string().uuid(),
});

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return jsonResponse({ error: 'Empresa nao encontrada' }, 403);
  }

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(
        { error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
        400
      );
    }

    const { messageId } = parsed.data;

    // Busca a mensagem garantindo que pertence a company autenticada
    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        conversation: { companyId: auth.companyId },
      },
      select: {
        id: true,
        uazMessageId: true,
        conversationId: true,
        mediaUrl: true,
      },
    });

    if (!message) {
      return jsonResponse({ error: 'Mensagem nao encontrada' }, 404);
    }

    // Se tem uazMessageId, manda o revoke pro WhatsApp antes de deletar
    if (message.uazMessageId) {
      const instance = await prisma.inbox.findFirst({
        where: { companyId: auth.companyId, isActive: true },
        select: { apiUrl: true, instanceApiKey: true },
      });

      if (instance?.apiUrl && instance?.instanceApiKey) {
        try {
          const res = await fetch(`${instance.apiUrl}/message/delete`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              token: instance.instanceApiKey,
            },
            body: JSON.stringify({ id: message.uazMessageId }),
          });
          if (!res.ok) {
            const errText = await res.text();
            console.warn('[delete-message] UazAPI revoke falhou:', res.status, errText);
          } else {
            console.log('[delete-message] Revoke enviado ao WhatsApp:', message.uazMessageId);
          }
        } catch (err) {
          console.warn('[delete-message] UazAPI revoke exception:', err);
        }
      }
    }

    // Deleta do banco (se o revoke falhou, pelo menos some do CRM)
    await prisma.message.delete({ where: { id: messageId } });

    // Cleanup da midia no B2 (best-effort, nao bloqueia resposta)
    if (message.mediaUrl) {
      deleteMediaFromUrl(message.mediaUrl).catch(() => {});
    }

    // Publica para outras abas/dispositivos atualizarem em tempo real
    await publishEvent(auth.companyId, {
      type: 'message:delete',
      conversationId: message.conversationId,
      messageId,
    });

    return jsonResponse({
      success: true,
      message_id: messageId,
      conversation_id: message.conversationId,
    });
  } catch (error) {
    return handleApiErrorCors(error, '[delete-message] Erro')
  }
}
