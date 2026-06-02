import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse } from '@/lib/api/cors';
import { publishEvent } from '@/lib/realtime';
import { deleteMediaFromUrl } from '@/lib/storage';
import { z } from 'zod';
import { handleApiErrorCors } from '@/lib/api/errors'

// Apagar mensagens EM MASSA. Espelha /delete-message (single) mas em lote.
// A selecao acontece dentro de UMA conversa aberta, entao o revoke usa a inbox
// dessa conversa. Limite de 100 por request pra nao estourar a UazAPI/SSE.
const schema = z.object({
  messageIds: z.array(z.string().uuid()).min(1).max(100),
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

    const { messageIds } = parsed.data;

    // IDOR: so mensagens de conversas da company autenticada
    const messages = await prisma.message.findMany({
      where: {
        id: { in: messageIds },
        conversation: { companyId: auth.companyId },
      },
      select: { id: true, uazMessageId: true, conversationId: true, mediaUrl: true },
    });

    if (messages.length === 0) {
      return jsonResponse({ error: 'Nenhuma mensagem encontrada' }, 404);
    }

    const validIds = messages.map((m) => m.id);
    const conversationId = messages[0].conversationId;

    // Revoke no WhatsApp (best-effort). Usa a inbox da conversa — nao a
    // "primeira inbox ativa" — pra revogar pela instancia certa quando ha
    // varias caixas de entrada.
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, companyId: auth.companyId },
      select: { inbox: { select: { apiUrl: true, instanceApiKey: true } } },
    });
    const instance = conversation?.inbox;

    if (instance?.apiUrl && instance?.instanceApiKey) {
      await Promise.allSettled(
        messages
          .filter((m) => m.uazMessageId)
          .map((m) =>
            fetch(`${instance.apiUrl}/message/delete`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                token: instance.instanceApiKey as string,
              },
              body: JSON.stringify({ id: m.uazMessageId }),
            }).catch(() => {})
          )
      );
    }

    // Deleta do banco (IDOR reforcado no where do deleteMany)
    await prisma.message.deleteMany({
      where: { id: { in: validIds }, conversation: { companyId: auth.companyId } },
    });

    // Cleanup de midia no B2 (best-effort, nao bloqueia resposta)
    for (const m of messages) {
      if (m.mediaUrl) deleteMediaFromUrl(m.mediaUrl).catch(() => {});
    }

    // Realtime: publica um delete por mensagem (reusa o handler existente
    // 'message:delete' do cliente). Usa o conversationId de cada mensagem.
    await Promise.allSettled(
      messages.map((m) =>
        publishEvent(auth.companyId, {
          type: 'message:delete',
          conversationId: m.conversationId,
          messageId: m.id,
        })
      )
    );

    return jsonResponse({
      success: true,
      deleted: validIds.length,
      conversation_id: conversationId,
    });
  } catch (error) {
    return handleApiErrorCors(error, '[delete-messages] Erro')
  }
}
